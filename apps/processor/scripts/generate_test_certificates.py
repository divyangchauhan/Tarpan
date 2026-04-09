"""
Synthetic death certificate image generator for P5-02 accuracy testing.

Usage (from apps/processor/):
    poetry run python scripts/generate_test_certificates.py
    poetry run python scripts/generate_test_certificates.py --out-dir /tmp/certs --count 20

Generates --count certificates (default 20) as images across 4 quality tiers
(round-robin, 5 each for the default 20):

  high     — 300 DPI PNG, no degradation
  medium   — 150 DPI JPEG q=85, slight compression
  blurry   — 200 DPI with random Gaussian blur r=1.5-3.5, JPEG q=80
  low_res  — 300 DPI render, then 3× downsample + nearest-neighbour upscale,
             JPEG q=65 (simulates a bad flatbed scan)

Output directory structure:
  <out-dir>/
    cert_001_high.png
    cert_002_medium.jpg
    cert_003_blurry.jpg
    cert_004_low_res.jpg
    ...
    ground_truth.json   — list of CertificateData dicts keyed by filename

All personal data is entirely fabricated via Faker.  No real PII is used.
The rendered form contains a visible "TEST DOCUMENT" watermark.
"""

from __future__ import annotations

import argparse
import io
import json
import random
import sys
from dataclasses import asdict, dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Literal

import pdfplumber
from faker import Faker
from jinja2 import Environment
from PIL import Image, ImageFilter
from weasyprint import HTML

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_US_STATES: list[tuple[str, str]] = [
    ("Alabama", "AL"),
    ("Alaska", "AK"),
    ("Arizona", "AZ"),
    ("Arkansas", "AR"),
    ("California", "CA"),
    ("Colorado", "CO"),
    ("Connecticut", "CT"),
    ("Delaware", "DE"),
    ("Florida", "FL"),
    ("Georgia", "GA"),
    ("Idaho", "ID"),
    ("Illinois", "IL"),
    ("Indiana", "IN"),
    ("Iowa", "IA"),
    ("Kansas", "KS"),
    ("Kentucky", "KY"),
    ("Louisiana", "LA"),
    ("Maine", "ME"),
    ("Maryland", "MD"),
    ("Massachusetts", "MA"),
    ("Michigan", "MI"),
    ("Minnesota", "MN"),
    ("Mississippi", "MS"),
    ("Missouri", "MO"),
    ("Montana", "MT"),
    ("Nebraska", "NE"),
    ("Nevada", "NV"),
    ("New Hampshire", "NH"),
    ("New Jersey", "NJ"),
    ("New Mexico", "NM"),
    ("New York", "NY"),
    ("North Carolina", "NC"),
    ("North Dakota", "ND"),
    ("Ohio", "OH"),
    ("Oklahoma", "OK"),
    ("Oregon", "OR"),
    ("Pennsylvania", "PA"),
    ("Rhode Island", "RI"),
    ("South Carolina", "SC"),
    ("South Dakota", "SD"),
    ("Tennessee", "TN"),
    ("Texas", "TX"),
    ("Utah", "UT"),
    ("Vermont", "VT"),
    ("Virginia", "VA"),
    ("Washington", "WA"),
    ("West Virginia", "WV"),
    ("Wisconsin", "WI"),
    ("Wyoming", "WY"),
]

_PLACE_OF_DEATH_TYPES = [
    "Inpatient",
    "Outpatient / ER",
    "Dead on arrival",
    "Home",
    "Hospice",
    "Nursing home/long term care facility",
    "Other",
]

_MARITAL_STATUSES = ["Married", "Widowed", "Divorced", "Single/Never Married"]

_CERTIFIER_TITLES = [
    "Attending Physician",
    "Medical Examiner",
    "Coroner",
    "Physician",
    "Deputy Medical Examiner",
]

_DISPOSITION_METHODS = ["Burial", "Cremation", "Donation", "Entombment"]

_FACILITY_SUFFIXES = [
    "Medical Center",
    "General Hospital",
    "Community Hospital",
    "Memorial Hospital",
    "Regional Hospital",
]

_CEMETERY_SUFFIXES = ["Cemetery", "Memorial Park", "Crematory", "Memorial Gardens"]

QualityTier = Literal["high", "medium", "blurry", "low_res"]

_TIER_CYCLE: list[QualityTier] = ["high", "medium", "blurry", "low_res"]

# Resolution (DPI) used when rasterising each tier.
_TIER_RESOLUTION: dict[QualityTier, int] = {
    "high": 300,
    "medium": 150,
    "blurry": 200,
    "low_res": 300,  # render sharp then degrade deliberately
}

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class CertificateData:
    """All fields that appear on the synthetic death certificate form."""

    # File numbers
    state_file_no: str
    local_file_no: str
    # Decedent identity
    full_name: str
    first_name: str
    middle_name: str | None
    last_name: str
    sex: str
    ssn: str
    age_years: str
    date_of_birth: str  # MM/DD/YYYY
    birthplace: str
    # Residence
    residence_state: str
    residence_county: str
    residence_city: str
    residence_street: str
    residence_zip: str
    inside_city_limits: str
    # Background
    armed_forces: str
    marital_status: str
    surviving_spouse: str | None
    father_name: str
    mother_name: str
    # Informant
    informant_name: str
    informant_relationship: str
    informant_address: str
    # Place / date of death
    place_of_death_type: str
    facility_name: str
    facility_city: str
    facility_county: str
    facility_state: str
    date_of_death: str  # MM/DD/YYYY
    time_of_death: str  # HH:MM
    # Certifier
    certifier_name: str
    certifier_title: str
    certifier_license: str
    certifier_address: str
    date_certified: str
    # Disposition
    disposition_method: str
    disposition_place: str
    disposition_date: str
    # Registrar
    registrar_name: str
    date_registered: str


# ---------------------------------------------------------------------------
# Fake data generation
# ---------------------------------------------------------------------------


def _fake_ssn() -> str:
    """Return a clearly fake SSN (000- prefix is never issued by SSA)."""
    return f"000-{random.randint(10, 99):02d}-{random.randint(1000, 9999)}"


def _generate_data(fake: Faker) -> CertificateData:
    state_name, state_abbr = random.choice(_US_STATES)

    dob = fake.date_of_birth(minimum_age=60, maximum_age=104)
    dod_year = random.randint(2020, 2025)
    dod: date = fake.date_between(
        start_date=date(dod_year, 1, 1),
        end_date=date(dod_year, 12, 31),
    )
    # Ensure DOD is after DOB.
    if dod <= dob:
        dod = dob + timedelta(days=365)

    age = dod.year - dob.year - ((dod.month, dod.day) < (dob.month, dob.day))

    date_certified = dod + timedelta(days=random.randint(1, 2))
    date_registered = date_certified + timedelta(days=random.randint(0, 1))
    disposition_date = dod + timedelta(days=random.randint(3, 10))

    marital_status = random.choice(_MARITAL_STATUSES)
    surviving_spouse: str | None = fake.name_female() if marital_status == "Married" else None

    first = fake.first_name()
    last = fake.last_name()
    middle: str | None = fake.first_name() if random.random() > 0.3 else None
    full_name = f"{first} {middle + ' ' if middle else ''}{last}"

    informant_first = fake.first_name()
    informant_last = fake.last_name()
    relationship = random.choice(["Son", "Daughter", "Spouse", "Sibling", "Parent"])

    facility_city = fake.city()
    seq = random.randint(1000, 99999)
    state_file_no = f"{dod.year}-{state_abbr}-{seq:06d}"
    local_file_no = f"{state_abbr}-{dod.year}-{dod.month:02d}{dod.day:02d}"

    certifier_name = f"Dr. {fake.first_name()} {fake.last_name()}"
    certifier_title = random.choice(_CERTIFIER_TITLES)
    certifier_license = f"{state_abbr}-{random.randint(100000, 999999)}"

    return CertificateData(
        state_file_no=state_file_no,
        local_file_no=local_file_no,
        full_name=full_name,
        first_name=first,
        middle_name=middle,
        last_name=last,
        sex=random.choice(["Male", "Female"]),
        ssn=_fake_ssn(),
        age_years=str(age),
        date_of_birth=dob.strftime("%m/%d/%Y"),
        birthplace=f"{fake.city()}, {state_name}",
        residence_state=state_name,
        residence_county=f"{fake.last_name()} County",
        residence_city=fake.city(),
        residence_street=fake.street_address(),
        residence_zip=fake.zipcode(),
        inside_city_limits=random.choice(["Yes", "No"]),
        armed_forces=random.choice(["Yes", "No"]),
        marital_status=marital_status,
        surviving_spouse=surviving_spouse,
        father_name=f"{fake.first_name_male()} {fake.first_name()} {last}",
        mother_name=f"{fake.first_name_female()} {fake.first_name()} {fake.last_name()}",
        informant_name=f"{informant_first} {informant_last}",
        informant_relationship=relationship,
        informant_address=fake.address().replace("\n", ", "),
        place_of_death_type=random.choice(_PLACE_OF_DEATH_TYPES),
        facility_name=f"{facility_city} {random.choice(_FACILITY_SUFFIXES)}",
        facility_city=facility_city,
        facility_county=f"{fake.last_name()} County",
        facility_state=state_name,
        date_of_death=dod.strftime("%m/%d/%Y"),
        time_of_death=f"{random.randint(0, 23):02d}:{random.randint(0, 59):02d}",
        certifier_name=certifier_name,
        certifier_title=certifier_title,
        certifier_license=certifier_license,
        certifier_address=fake.address().replace("\n", ", "),
        date_certified=date_certified.strftime("%m/%d/%Y"),
        disposition_method=random.choice(_DISPOSITION_METHODS),
        disposition_place=(
            f"{fake.last_name()} {random.choice(_CEMETERY_SUFFIXES)}, "
            f"{fake.city()}, {state_name}"
        ),
        disposition_date=disposition_date.strftime("%m/%d/%Y"),
        registrar_name=fake.name(),
        date_registered=date_registered.strftime("%m/%d/%Y"),
    )


# ---------------------------------------------------------------------------
# HTML template
# ---------------------------------------------------------------------------

_TEMPLATE = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<style>
  @page { size: letter; margin: 0.5in; }
  * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
  body { font-size: 7pt; color: #000; margin: 0; }

  .header {
    text-align: center;
    border: 2px solid #000;
    padding: 4px;
    margin-bottom: 4px;
  }
  .header h1 { font-size: 11pt; margin: 0 0 2px 0; letter-spacing: 1px; }
  .header p  { font-size: 7pt; margin: 1px 0; }

  table { width: 100%; border-collapse: collapse; }
  td, th {
    border: 1px solid #555;
    padding: 2px 4px;
    vertical-align: top;
  }
  .label {
    font-size: 6pt;
    font-weight: bold;
    color: #333;
    display: block;
    margin-bottom: 1px;
  }
  .value {
    font-size: 8pt;
    font-weight: normal;
    min-height: 12px;
    display: block;
  }
  .section-header {
    background: #ccc;
    font-weight: bold;
    font-size: 7pt;
    text-align: center;
    padding: 2px;
  }
  .watermark {
    font-size: 6pt;
    font-style: italic;
    text-align: center;
    margin-top: 6px;
    color: #555;
  }
  .small { font-size: 6pt; }
</style>
</head>
<body>

<div class="header">
  <h1>U.S. STANDARD CERTIFICATE OF DEATH</h1>
  <p>Revised November 2003 &nbsp;|&nbsp; OMB No. 0920-0373</p>
  <p class="small">
    This form is prescribed for use by the National Center for Health Statistics (NCHS),
    Centers for Disease Control and Prevention.
  </p>
</div>

<table>
  <tr>
    <td style="width:50%">
      <span class="label">LOCAL FILE NO.</span>
      <span class="value">{{ d.local_file_no }}</span>
    </td>
    <td style="width:50%">
      <span class="label">STATE FILE NO.</span>
      <span class="value">{{ d.state_file_no }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2">
      <span class="label">1. DECEDENT'S LEGAL NAME (First, Middle, Last)</span>
      <span class="value">{{ d.full_name }}</span>
    </td>
  </tr>
  <tr>
    <td style="width:33%">
      <span class="label">2. SEX</span>
      <span class="value">{{ d.sex }}</span>
    </td>
    <td style="width:67%">
      <span class="label">3. SOCIAL SECURITY NUMBER</span>
      <span class="value">{{ d.ssn }}</span>
    </td>
  </tr>

  <tr>
    <td style="width:20%">
      <span class="label">4a. AGE – Last Birthday (Years)</span>
      <span class="value">{{ d.age_years }}</span>
    </td>
    <td style="width:40%">
      <span class="label">5. DATE OF BIRTH (Mo/Day/Yr)</span>
      <span class="value">{{ d.date_of_birth }}</span>
    </td>
    <td style="width:40%">
      <span class="label">6. BIRTHPLACE (City and State or Foreign Country)</span>
      <span class="value">{{ d.birthplace }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2" class="section-header">DECEDENT'S RESIDENCE</td>
  </tr>
  <tr>
    <td>
      <span class="label">7a. STATE</span>
      <span class="value">{{ d.residence_state }}</span>
    </td>
    <td>
      <span class="label">7b. COUNTY</span>
      <span class="value">{{ d.residence_county }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">7c. CITY OR TOWN</span>
      <span class="value">{{ d.residence_city }}</span>
    </td>
    <td>
      <span class="label">7d. STREET AND NUMBER</span>
      <span class="value">{{ d.residence_street }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">7f. ZIP CODE</span>
      <span class="value">{{ d.residence_zip }}</span>
    </td>
    <td>
      <span class="label">7g. INSIDE CITY LIMITS?</span>
      <span class="value">{{ d.inside_city_limits }}</span>
    </td>
  </tr>

  <tr>
    <td>
      <span class="label">8. EVER IN US ARMED FORCES?</span>
      <span class="value">{{ d.armed_forces }}</span>
    </td>
    <td>
      <span class="label">9. MARITAL STATUS AT TIME OF DEATH</span>
      <span class="value">{{ d.marital_status }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">10. SURVIVING SPOUSE'S NAME (If wife, give name prior to first marriage)</span>
      <span class="value">{{ d.surviving_spouse or '' }}</span>
    </td>
  </tr>

  <tr>
    <td>
      <span class="label">11. FATHER'S NAME (First, Middle, Last)</span>
      <span class="value">{{ d.father_name }}</span>
    </td>
    <td>
      <span class="label">12. MOTHER'S NAME PRIOR TO FIRST MARRIAGE (First, Middle, Last)</span>
      <span class="value">{{ d.mother_name }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2" class="section-header">INFORMANT</td>
  </tr>
  <tr>
    <td>
      <span class="label">14. INFORMANT'S NAME</span>
      <span class="value">{{ d.informant_name }}</span>
    </td>
    <td>
      <span class="label">RELATIONSHIP TO DECEDENT</span>
      <span class="value">{{ d.informant_relationship }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">MAILING ADDRESS (Street and Number, City, State, Zip Code)</span>
      <span class="value">{{ d.informant_address }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2" class="section-header">PLACE AND DATE OF DEATH</td>
  </tr>
  <tr>
    <td>
      <span class="label">22. PLACE OF DEATH (Check only one)</span>
      <span class="value">{{ d.place_of_death_type }}</span>
    </td>
    <td>
      <span class="label">FACILITY NAME (If not institution, give street &amp; number)</span>
      <span class="value">{{ d.facility_name }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">CITY OR TOWN, STATE</span>
      <span class="value">{{ d.facility_city }}, {{ d.facility_state }}</span>
    </td>
    <td>
      <span class="label">COUNTY OF DEATH</span>
      <span class="value">{{ d.facility_county }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">29. DATE OF DEATH (Mo/Day/Yr) (Spell Month)</span>
      <span class="value">{{ d.date_of_death }}</span>
    </td>
    <td>
      <span class="label">TIME OF DEATH</span>
      <span class="value">{{ d.time_of_death }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2" class="section-header">CERTIFIER</td>
  </tr>
  <tr>
    <td>
      <span class="label">33. CERTIFIER NAME (Type/Print)</span>
      <span class="value">{{ d.certifier_name }}</span>
    </td>
    <td>
      <span class="label">TITLE</span>
      <span class="value">{{ d.certifier_title }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">LICENSE NUMBER</span>
      <span class="value">{{ d.certifier_license }}</span>
    </td>
    <td>
      <span class="label">DATE CERTIFIED (Mo/Day/Yr)</span>
      <span class="value">{{ d.date_certified }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">ADDRESS (Street and Number, City, State, Zip Code)</span>
      <span class="value">{{ d.certifier_address }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2" class="section-header">DISPOSITION</td>
  </tr>
  <tr>
    <td>
      <span class="label">37. METHOD OF DISPOSITION</span>
      <span class="value">{{ d.disposition_method }}</span>
    </td>
    <td>
      <span class="label">DATE OF DISPOSITION (Mo/Day/Yr)</span>
      <span class="value">{{ d.disposition_date }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">PLACE OF DISPOSITION (Name of cemetery, crematory, other place)</span>
      <span class="value">{{ d.disposition_place }}</span>
    </td>
  </tr>

  <tr>
    <td colspan="2" class="section-header">FOR REGISTRAR ONLY</td>
  </tr>
  <tr>
    <td>
      <span class="label">REGISTRAR'S NAME (Type/Print)</span>
      <span class="value">{{ d.registrar_name }}</span>
    </td>
    <td>
      <span class="label">DATE FILED / REGISTERED (Mo/Day/Yr)</span>
      <span class="value">{{ d.date_registered }}</span>
    </td>
  </tr>
</table>

<p class="watermark">
  THIS IS A TEST DOCUMENT — ALL DATA IS FABRICATED — NOT A LEGAL RECORD
</p>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# PDF rendering
# ---------------------------------------------------------------------------


def _render_pdf(data: CertificateData) -> bytes:
    """Render a CertificateData to PDF bytes using WeasyPrint + Jinja2."""
    env = Environment()
    template = env.from_string(_TEMPLATE)
    html_str = template.render(d=data)
    buf = io.BytesIO()
    HTML(string=html_str).write_pdf(buf)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Quality tier transformations
# ---------------------------------------------------------------------------


def _pdf_to_pil(pdf_bytes: bytes, resolution: int) -> Image.Image:
    """Rasterise the first page of a PDF to a PIL Image at the given DPI."""
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        page = pdf.pages[0]
        page_image = page.to_image(resolution=resolution)
        return page_image.original.convert("RGB")


def _apply_tier(img: Image.Image, tier: QualityTier) -> tuple[bytes, str]:
    """
    Apply quality degradation for the given tier.

    Returns (image_bytes, file_extension).
    """
    buf = io.BytesIO()

    if tier == "high":
        img.save(buf, format="PNG", optimize=False)
        return buf.getvalue(), "png"

    if tier == "medium":
        img.save(buf, format="JPEG", quality=85)
        return buf.getvalue(), "jpg"

    if tier == "blurry":
        radius = round(random.uniform(1.5, 3.5), 1)
        blurred = img.filter(ImageFilter.GaussianBlur(radius=radius))
        blurred.save(buf, format="JPEG", quality=80)
        return buf.getvalue(), "jpg"

    # low_res: downsample 3× then upscale back with nearest-neighbour to produce
    # a blocky, low-fidelity image that simulates a bad scan saved at full size.
    w, h = img.size
    small = img.resize((w // 3, h // 3), Image.LANCZOS)
    degraded = small.resize((w, h), Image.NEAREST)
    degraded.save(buf, format="JPEG", quality=65)
    return buf.getvalue(), "jpg"


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic death certificate images for accuracy testing."
    )
    parser.add_argument(
        "--out-dir",
        default="scripts/test_certificates",
        help="Directory to write images and ground_truth.json (default: scripts/test_certificates)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help="Number of certificates to generate (default: 20)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv or sys.argv[1:])

    random.seed(args.seed)
    fake = Faker()
    Faker.seed(args.seed)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    ground_truth: dict[str, dict] = {}  # filename → CertificateData dict
    tiers: list[QualityTier] = (_TIER_CYCLE * ((args.count // len(_TIER_CYCLE)) + 1))[: args.count]

    print(f"Generating {args.count} synthetic certificates → {out_dir}/")
    print(f"Quality distribution: {', '.join(f'{tiers.count(t)} {t}' for t in _TIER_CYCLE)}\n")

    for i in range(args.count):
        tier = tiers[i]
        cert_num = i + 1

        # 1. Generate fake data.
        data = _generate_data(fake)

        # 2. Render to PDF.
        pdf_bytes = _render_pdf(data)

        # 3. Rasterise to PIL Image at tier-appropriate DPI.
        resolution = _TIER_RESOLUTION[tier]
        img = _pdf_to_pil(pdf_bytes, resolution)

        # 4. Apply quality degradation and encode.
        image_bytes, ext = _apply_tier(img, tier)

        # 5. Write image file.
        filename = f"cert_{cert_num:03d}_{tier}.{ext}"
        out_path = out_dir / filename
        out_path.write_bytes(image_bytes)

        kb = len(image_bytes) // 1024
        print(f"  [{cert_num:02d}/{args.count}] {filename}  ({kb} KB, {resolution} DPI)")

        # 6. Record ground truth.
        ground_truth[filename] = asdict(data)

    # Write ground_truth.json.
    gt_path = out_dir / "ground_truth.json"
    gt_path.write_text(json.dumps(ground_truth, indent=2))
    print(f"\nGround truth written → {gt_path}")
    print(f"Done.  {args.count} certificates in {out_dir}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
