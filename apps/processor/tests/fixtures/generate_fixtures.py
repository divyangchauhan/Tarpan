"""
Fixture generator for US death certificate test PDFs.

Usage (from apps/processor/):
    poetry run python tests/fixtures/generate_fixtures.py

Produces:
  tests/fixtures/sample_death_cert_typed.pdf    — filled, text-extractable (tests text path)
  tests/fixtures/sample_death_cert_minimal.pdf  — minimal required fields only
  tests/fixtures/sample_death_cert_scanned.pdf  — image-only (tests vision path)

All data is entirely fabricated.  No real personal information is used.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

from jinja2 import Environment, FileSystemLoader
from PIL import Image
from weasyprint import HTML

# ---------------------------------------------------------------------------
# Fake test data
# ---------------------------------------------------------------------------

TYPED_DATA: dict[str, str | None] = {
    # Item 1 — Decedent
    "full_name": "John Robert Smith",
    "first_name": "John",
    "middle_name": "Robert",
    "last_name": "Smith",
    "sex": "Male",
    "ssn": "000-00-0001",
    # Items 4–6 — Age / DOB / Birthplace
    "age_years": "78",
    "date_of_birth": "03/15/1945",
    "birthplace": "Springfield, IL",
    # Items 7 — Residence
    "residence_state": "Illinois",
    "residence_county": "Sangamon County",
    "residence_city": "Springfield",
    "residence_street": "742 Evergreen Terrace",
    "residence_apt": "",
    "residence_zip": "62701",
    "inside_city_limits": "Yes",
    # Items 8–12
    "armed_forces": "No",
    "marital_status": "Widowed",
    "surviving_spouse": "N/A",
    "father_name": "William Charles Smith",
    "mother_name": "Dorothy Mae Johnson",
    # Items 14–18 — Informant
    "informant_name": "Michael J. Smith",
    "informant_relationship": "Son",
    "informant_address": "1600 Pennsylvania Ave, Springfield, IL 62702",
    # Item 22 — Place / date of death
    "place_of_death_type": "Inpatient",
    "facility_name": "Memorial Medical Center",
    "facility_city": "Springfield",
    "facility_county": "Sangamon County",
    "facility_state": "Illinois",
    "date_of_death": "11/20/2024",
    "time_of_death": "14:32",
    # Items 33–35 — Certifier
    "certifier_name": "Dr. Emily J. Chen",
    "certifier_title": "Medical Examiner",
    "certifier_license": "IL-054321",
    "certifier_address": "800 E. Carpenter St., Springfield, IL 62702",
    "date_certified": "11/21/2024",
    # Item 37 — Disposition
    "disposition_method": "Burial",
    "disposition_place": "Oak Ridge Cemetery, Springfield, IL",
    "disposition_date": "11/25/2024",
    # Registration
    "state_file_no": "2024-IL-048291",
    "local_file_no": "SG-2024-1120",
    "registrar_name": "Sandra K. Williams",
    "date_registered": "11/22/2024",
}

MINIMAL_DATA: dict[str, str | None] = {
    "full_name": "Jane Doe",
    "first_name": "Jane",
    "middle_name": None,
    "last_name": "Doe",
    "sex": "Female",
    "ssn": None,
    "age_years": "65",
    "date_of_birth": None,
    "birthplace": None,
    "residence_state": "California",
    "residence_county": None,
    "residence_city": "Los Angeles",
    "residence_street": None,
    "residence_apt": None,
    "residence_zip": None,
    "inside_city_limits": None,
    "armed_forces": None,
    "marital_status": "Unknown",
    "surviving_spouse": None,
    "father_name": None,
    "mother_name": None,
    "informant_name": None,
    "informant_relationship": None,
    "informant_address": None,
    "place_of_death_type": "Dead on arrival",
    "facility_name": "Cedars-Sinai Medical Center",
    "facility_city": "Los Angeles",
    "facility_county": "Los Angeles County",
    "facility_state": "California",
    "date_of_death": "01/05/2025",
    "time_of_death": "08:15",
    "certifier_name": "Dr. Marcus T. Webb",
    "certifier_title": "Physician",
    "certifier_license": "CA-112233",
    "certifier_address": "8700 Beverly Blvd, Los Angeles, CA 90048",
    "date_certified": "01/06/2025",
    "disposition_method": "Cremation",
    "disposition_place": "Forest Lawn Memorial Park, Glendale, CA",
    "disposition_date": "01/10/2025",
    "state_file_no": "2025-CA-001055",
    "local_file_no": "LA-2025-0105",
    "registrar_name": "Theresa M. Park",
    "date_registered": "01/07/2025",
}

# ---------------------------------------------------------------------------
# HTML template (inline — no separate file needed)
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
  .italic { font-style: italic; }
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
  <!-- Row 1: File numbers -->
  <tr>
    <td style="width:50%">
      <span class="label">LOCAL FILE NO.</span>
      <span class="value">{{ d.local_file_no or '' }}</span>
    </td>
    <td style="width:50%">
      <span class="label">STATE FILE NO.</span>
      <span class="value">{{ d.state_file_no or '' }}</span>
    </td>
  </tr>

  <!-- Row 2: Name / Sex / SSN -->
  <tr>
    <td colspan="2">
      <span class="label">1. DECEDENT'S LEGAL NAME (First, Middle, Last)</span>
      <span class="value">{{ d.full_name }}</span>
    </td>
  </tr>
  <tr>
    <td style="width:33%">
      <span class="label">2. SEX</span>
      <span class="value">{{ d.sex or '' }}</span>
    </td>
    <td style="width:67%">
      <span class="label">3. SOCIAL SECURITY NUMBER</span>
      <span class="value">{{ d.ssn or '' }}</span>
    </td>
  </tr>

  <!-- Row 3: Age / DOB / Birthplace -->
  <tr>
    <td style="width:20%">
      <span class="label">4a. AGE – Last Birthday (Years)</span>
      <span class="value">{{ d.age_years or '' }}</span>
    </td>
    <td style="width:40%">
      <span class="label">5. DATE OF BIRTH (Mo/Day/Yr)</span>
      <span class="value">{{ d.date_of_birth or '' }}</span>
    </td>
    <td style="width:40%">
      <span class="label">6. BIRTHPLACE (City and State or Foreign Country)</span>
      <span class="value">{{ d.birthplace or '' }}</span>
    </td>
  </tr>

  <!-- Row 4: Residence -->
  <tr>
    <td colspan="2" class="section-header">DECEDENT'S RESIDENCE</td>
  </tr>
  <tr>
    <td>
      <span class="label">7a. STATE</span>
      <span class="value">{{ d.residence_state or '' }}</span>
    </td>
    <td>
      <span class="label">7b. COUNTY</span>
      <span class="value">{{ d.residence_county or '' }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">7c. CITY OR TOWN</span>
      <span class="value">{{ d.residence_city or '' }}</span>
    </td>
    <td>
      <span class="label">7d. STREET AND NUMBER</span>
      <span class="value">{{ d.residence_street or '' }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">7f. ZIP CODE</span>
      <span class="value">{{ d.residence_zip or '' }}</span>
    </td>
    <td>
      <span class="label">7g. INSIDE CITY LIMITS?</span>
      <span class="value">{{ d.inside_city_limits or '' }}</span>
    </td>
  </tr>

  <!-- Row 5: Military / Marital -->
  <tr>
    <td>
      <span class="label">8. EVER IN US ARMED FORCES?</span>
      <span class="value">{{ d.armed_forces or '' }}</span>
    </td>
    <td>
      <span class="label">9. MARITAL STATUS AT TIME OF DEATH</span>
      <span class="value">{{ d.marital_status or '' }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">10. SURVIVING SPOUSE'S NAME (If wife, give name prior to first marriage)</span>
      <span class="value">{{ d.surviving_spouse or '' }}</span>
    </td>
  </tr>

  <!-- Row 6: Parents -->
  <tr>
    <td>
      <span class="label">11. FATHER'S NAME (First, Middle, Last)</span>
      <span class="value">{{ d.father_name or '' }}</span>
    </td>
    <td>
      <span class="label">12. MOTHER'S NAME PRIOR TO FIRST MARRIAGE (First, Middle, Last)</span>
      <span class="value">{{ d.mother_name or '' }}</span>
    </td>
  </tr>

  <!-- Informant -->
  <tr>
    <td colspan="2" class="section-header">INFORMANT</td>
  </tr>
  <tr>
    <td>
      <span class="label">14. INFORMANT'S NAME</span>
      <span class="value">{{ d.informant_name or '' }}</span>
    </td>
    <td>
      <span class="label">RELATIONSHIP TO DECEDENT</span>
      <span class="value">{{ d.informant_relationship or '' }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">MAILING ADDRESS (Street and Number, City, State, Zip Code)</span>
      <span class="value">{{ d.informant_address or '' }}</span>
    </td>
  </tr>

  <!-- Place / Date of Death -->
  <tr>
    <td colspan="2" class="section-header">PLACE AND DATE OF DEATH</td>
  </tr>
  <tr>
    <td>
      <span class="label">22. PLACE OF DEATH (Check only one)</span>
      <span class="value">{{ d.place_of_death_type or '' }}</span>
    </td>
    <td>
      <span class="label">FACILITY NAME (If not institution, give street & number)</span>
      <span class="value">{{ d.facility_name or '' }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">CITY OR TOWN, STATE</span>
      <span class="value">{{ d.facility_city or '' }}, {{ d.facility_state or '' }}</span>
    </td>
    <td>
      <span class="label">COUNTY OF DEATH</span>
      <span class="value">{{ d.facility_county or '' }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">29. DATE OF DEATH (Mo/Day/Yr) (Spell Month)</span>
      <span class="value">{{ d.date_of_death }}</span>
    </td>
    <td>
      <span class="label">TIME OF DEATH</span>
      <span class="value">{{ d.time_of_death or '' }}</span>
    </td>
  </tr>

  <!-- Certifier -->
  <tr>
    <td colspan="2" class="section-header">CERTIFIER</td>
  </tr>
  <tr>
    <td>
      <span class="label">33. CERTIFIER NAME (Type/Print)</span>
      <span class="value">{{ d.certifier_name or '' }}</span>
    </td>
    <td>
      <span class="label">TITLE</span>
      <span class="value">{{ d.certifier_title or '' }}</span>
    </td>
  </tr>
  <tr>
    <td>
      <span class="label">LICENSE NUMBER</span>
      <span class="value">{{ d.certifier_license or '' }}</span>
    </td>
    <td>
      <span class="label">DATE CERTIFIED (Mo/Day/Yr)</span>
      <span class="value">{{ d.date_certified or '' }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">ADDRESS (Street and Number, City, State, Zip Code)</span>
      <span class="value">{{ d.certifier_address or '' }}</span>
    </td>
  </tr>

  <!-- Disposition -->
  <tr>
    <td colspan="2" class="section-header">DISPOSITION</td>
  </tr>
  <tr>
    <td>
      <span class="label">37. METHOD OF DISPOSITION</span>
      <span class="value">{{ d.disposition_method or '' }}</span>
    </td>
    <td>
      <span class="label">DATE OF DISPOSITION (Mo/Day/Yr)</span>
      <span class="value">{{ d.disposition_date or '' }}</span>
    </td>
  </tr>
  <tr>
    <td colspan="2">
      <span class="label">PLACE OF DISPOSITION (Name of cemetery, crematory, other place)</span>
      <span class="value">{{ d.disposition_place or '' }}</span>
    </td>
  </tr>

  <!-- Registrar -->
  <tr>
    <td colspan="2" class="section-header">FOR REGISTRAR ONLY</td>
  </tr>
  <tr>
    <td>
      <span class="label">REGISTRAR'S NAME (Type/Print)</span>
      <span class="value">{{ d.registrar_name or '' }}</span>
    </td>
    <td>
      <span class="label">DATE FILED / REGISTERED (Mo/Day/Yr)</span>
      <span class="value">{{ d.date_registered or '' }}</span>
    </td>
  </tr>
</table>

<p class="small italic" style="margin-top: 6px; text-align: center;">
  THIS IS A TEST DOCUMENT — ALL DATA IS FABRICATED — NOT A LEGAL RECORD
</p>
</body>
</html>
"""

# ---------------------------------------------------------------------------
# Generator
# ---------------------------------------------------------------------------


def render_pdf(data: dict[str, str | None], out_path: Path) -> None:
    env = Environment(loader=FileSystemLoader("."))
    template = env.from_string(_TEMPLATE)
    html_str = template.render(d=data)
    HTML(string=html_str).write_pdf(str(out_path))
    print(f"  Written: {out_path} ({out_path.stat().st_size // 1024} KB)")


def render_scanned_pdf(source_pdf: Path, out_path: Path) -> None:
    """
    Render a PDF to images then re-save as a single-page image-only PDF.
    This simulates a scanned document to exercise the vision path.
    """
    import pdfplumber

    images: list[Image.Image] = []
    with pdfplumber.open(source_pdf) as pdf:
        for page in pdf.pages:
            pil_img = page.to_image(resolution=150).original.convert("RGB")
            images.append(pil_img)

    if not images:
        print(f"  Skipped (no pages): {out_path}")
        return

    first, rest = images[0], images[1:]
    first.save(str(out_path), format="PDF", save_all=True, append_images=rest)
    print(f"  Written: {out_path} ({out_path.stat().st_size // 1024} KB)")


def main() -> None:
    fixtures = Path(__file__).parent

    print("Generating death certificate test fixtures...")

    render_pdf(TYPED_DATA, fixtures / "sample_death_cert_typed.pdf")
    render_pdf(MINIMAL_DATA, fixtures / "sample_death_cert_minimal.pdf")

    typed_path = fixtures / "sample_death_cert_typed.pdf"
    if typed_path.exists():
        render_scanned_pdf(typed_path, fixtures / "sample_death_cert_scanned.pdf")

    print("\nDone.  Fixtures:")
    for f in sorted(fixtures.glob("sample_death_cert_*.pdf")):
        print(f"  {f.name}")


if __name__ == "__main__":
    sys.exit(main())
