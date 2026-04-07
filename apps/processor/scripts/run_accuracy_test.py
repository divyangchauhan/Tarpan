"""
Parser accuracy test runner for P5-02.

Sends certificate images through the real extractor (Claude API) and scores
the results against ground truth where available.

Usage:
    # Synthetic certificates (with scoring against ground_truth.json):
    poetry run python scripts/run_accuracy_test.py \\
        --image-dir scripts/test_certificates \\
        --ground-truth scripts/test_certificates/ground_truth.json

    # Historical certificates (extraction only — no scoring):
    poetry run python scripts/run_accuracy_test.py \\
        --image-dir scripts/historical_certificates

Requirements:
    ANTHROPIC_API_KEY must be set in the environment (or in apps/processor/.env).

Output:
    Prints a per-field accuracy table and per-quality-tier breakdown to stdout.
    Writes accuracy_report.json into --image-dir (or --report-out if specified).

How scoring works (synthetic certs only):
    Each ExtractedCertificateData field is compared to the matching
    CertificateData field in ground_truth.json using a field-specific
    normaliser (date parsing, whitespace/case folding, prefix stripping, etc.).
    A field is CORRECT if normalised values match exactly.
    A field is MISSING if the extractor returned None / omitted it.
    A field is WRONG if it returned a non-None value that didn't match.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Any

# Ensure the processor package root (apps/processor/) is on sys.path so that
# `src.*` imports resolve whether the script is run from the project root or
# from within apps/processor/.
sys.path.insert(0, str(Path(__file__).parent.parent))

# ---------------------------------------------------------------------------
# Bootstrap env vars before importing src modules (mirrors conftest.py).
# ---------------------------------------------------------------------------
_ENV_DEFAULTS = {
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ENDPOINT_URL": "",
    "API_CALLBACK_URL": "http://localhost:3001",
    "INTERNAL_API_SECRET": "test-secret",
    "S3_UPLOADS_BUCKET": "afterlight-uploads",
    "S3_GENERATED_DOCS_BUCKET": "afterlight-generated-docs",
    "SQS_DOCUMENT_PROCESSING_QUEUE_URL": "http://localhost:4566/000000000000/afterlight-document-processing",
    "SQS_DOCUMENT_GENERATION_QUEUE_URL": "http://localhost:4566/000000000000/afterlight-document-generation",
}
for _k, _v in _ENV_DEFAULTS.items():
    os.environ.setdefault(_k, _v)

# ANTHROPIC_API_KEY must be real — don't set a default.
if not os.environ.get("ANTHROPIC_API_KEY"):
    # Try loading from .env in the processor directory.
    _env_file = Path(__file__).parent.parent / ".env"
    if _env_file.exists():
        for line in _env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

from src.extractor import extract_certificate_data  # noqa: E402
from src.models import ExtractedCertificateData  # noqa: E402
from src.pdf_processor import prepare_content_for_claude  # noqa: E402

logging.basicConfig(level=logging.WARNING, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}
_CONTENT_TYPES: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".tif": "image/tiff",
    ".tiff": "image/tiff",
}

# Fields we can score against ground truth (ExtractedCertificateData field → GT field).
_SCORED_FIELDS: list[tuple[str, str]] = [
    ("full_name", "full_name"),
    ("first_name", "first_name"),
    ("last_name", "last_name"),
    ("date_of_birth", "date_of_birth"),     # format conversion required
    ("date_of_death", "date_of_death"),     # format conversion required
    ("state", "residence_state"),           # full name → abbrev conversion
    ("certificate_number", "state_file_no"),
    ("certifier_name", "certifier_name"),
    ("certifier_title", "certifier_title"),
]

# Map full US state names to 2-letter abbreviations.
_STATE_ABBREV: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "florida": "FL", "georgia": "GA", "idaho": "ID", "illinois": "IL",
    "indiana": "IN", "iowa": "IA", "kansas": "KS", "kentucky": "KY",
    "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA",
    "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO",
    "montana": "MT", "nebraska": "NE", "nevada": "NV", "new hampshire": "NH",
    "new jersey": "NJ", "new mexico": "NM", "new york": "NY",
    "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA",
    "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT",
    "virginia": "VA", "washington": "WA", "west virginia": "WV",
    "wisconsin": "WI", "wyoming": "WY",
}

# Delay between Claude API calls (seconds).
_API_DELAY = 0.5

# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------


def _norm_str(v: str | None) -> str:
    """Lowercase, collapse whitespace."""
    if v is None:
        return ""
    return " ".join(v.lower().split())


def _norm_date_gt(v: str | None) -> str:
    """
    Normalise a ground-truth date (MM/DD/YYYY) to YYYY-MM-DD.
    Returns "" on failure.
    """
    if not v:
        return ""
    for fmt in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(v, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return v.strip().lower()


def _norm_date_extracted(v: str | None) -> str:
    """Normalise an extracted date (expected YYYY-MM-DD). Returns "" on None."""
    if not v:
        return ""
    return v.strip()


def _norm_state_gt(v: str | None) -> str:
    """
    Normalise ground-truth state (full name like 'Illinois') to 2-letter abbrev.
    Returns the original value lowercased if not found.
    """
    if not v:
        return ""
    return _STATE_ABBREV.get(v.lower(), v.strip().lower())


def _norm_state_extracted(v: str | None) -> str:
    """Normalise extracted state (expected 2-letter abbrev)."""
    if not v:
        return ""
    return v.strip().lower()


def _norm_certifier_name(v: str | None) -> str:
    """Strip 'Dr.' prefix, lowercase, collapse whitespace."""
    if not v:
        return ""
    s = v.strip()
    for prefix in ("Dr. ", "Dr.", "DR. ", "DR."):
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    return " ".join(s.lower().split())


def _compare_field(
    extracted_field: str,
    gt_field: str,
    extracted_val: str | None,
    gt_val: str | None,
) -> tuple[str, str, str]:
    """
    Compare one extracted value against the ground truth value.

    Returns (status, norm_extracted, norm_gt) where status is
    "correct" | "wrong" | "missing" | "skip".
    """
    # Special cases per field.
    if extracted_field in ("date_of_birth", "date_of_death"):
        ne = _norm_date_extracted(extracted_val)
        ng = _norm_date_gt(gt_val)
    elif extracted_field == "state":
        ne = _norm_state_extracted(extracted_val)
        ng = _norm_state_gt(gt_val)
    elif extracted_field == "certifier_name":
        ne = _norm_certifier_name(extracted_val)
        ng = _norm_certifier_name(gt_val)
    else:
        ne = _norm_str(extracted_val)
        ng = _norm_str(gt_val)

    if not ng:
        # Ground truth has no value — skip scoring this field for this cert.
        return "skip", ne, ng

    if not ne:
        return "missing", ne, ng

    if ne == ng:
        return "correct", ne, ng

    return "wrong", ne, ng


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class FieldResult:
    status: str          # correct | wrong | missing | skip
    extracted: str
    expected: str


@dataclass
class CertResult:
    filename: str
    quality_tier: str    # high | medium | blurry | low_res | unknown | historical
    extracted: dict[str, Any]
    field_results: dict[str, FieldResult] = field(default_factory=dict)
    error: str | None = None


# ---------------------------------------------------------------------------
# Quality tier detection
# ---------------------------------------------------------------------------


def _detect_tier(filename: str) -> str:
    """Extract quality tier from filename produced by generate_test_certificates.py."""
    name = Path(filename).stem.lower()
    for tier in ("high", "medium", "blurry", "low_res"):
        if name.endswith(f"_{tier}"):
            return tier
    if name.startswith("hist_"):
        return "historical"
    return "unknown"


# ---------------------------------------------------------------------------
# Core test runner
# ---------------------------------------------------------------------------


def _run_extraction(image_path: Path) -> ExtractedCertificateData | Exception:
    """Load image, call extractor, return result or the exception raised."""
    suffix = image_path.suffix.lower()
    content_type = _CONTENT_TYPES.get(suffix, "image/jpeg")
    file_bytes = image_path.read_bytes()
    try:
        content = prepare_content_for_claude(file_bytes, content_type)
        return extract_certificate_data(content)
    except Exception as exc:
        return exc


def _score(result: CertResult, gt: dict[str, Any]) -> None:
    """Populate result.field_results by comparing against ground truth."""
    extracted = result.extracted
    for ext_field, gt_field in _SCORED_FIELDS:
        ext_val = extracted.get(ext_field)
        gt_val = gt.get(gt_field)
        status, ne, ng = _compare_field(ext_field, gt_field, ext_val, gt_val)
        result.field_results[ext_field] = FieldResult(status=status, extracted=ne, expected=ng)


# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------


def _print_report(results: list[CertResult], has_ground_truth: bool) -> None:
    total = len(results)
    errors = [r for r in results if r.error]

    print(f"\n{'=' * 70}")
    print(f"  AfterLight P5-02 Accuracy Report — {total} certificates")
    print(f"{'=' * 70}")

    if errors:
        print(f"\n  ERRORS ({len(errors)} certs failed extraction):")
        for r in errors:
            print(f"    {r.filename}: {r.error}")

    ok_results = [r for r in results if not r.error]

    if not has_ground_truth:
        print("\n  Extraction-only mode (no ground_truth.json — results not scored).\n")
        for r in ok_results:
            print(f"\n  {r.filename}  [{r.quality_tier}]")
            for k, v in r.extracted.items():
                if v is not None:
                    print(f"    {k:<22} {v}")
        return

    # ---- Per-field accuracy table ----
    field_names = [f for f, _ in _SCORED_FIELDS]
    field_counts: dict[str, dict[str, int]] = {
        f: {"correct": 0, "wrong": 0, "missing": 0, "skip": 0} for f in field_names
    }

    for r in ok_results:
        for fname, fr in r.field_results.items():
            field_counts[fname][fr.status] += 1

    print(f"\n  Field Accuracy  (n={len(ok_results)} certs successfully extracted)\n")
    print(f"  {'Field':<24} {'Correct':>8} {'Missing':>8} {'Wrong':>8} {'Acc %':>8}")
    print(f"  {'-' * 60}")

    for fname in field_names:
        c = field_counts[fname]
        scored = c["correct"] + c["wrong"] + c["missing"]
        acc = (c["correct"] / scored * 100) if scored else 0.0
        print(
            f"  {fname:<24} {c['correct']:>8} {c['missing']:>8} {c['wrong']:>8} {acc:>7.0f}%"
        )

    # Overall accuracy (exclude skips).
    total_scored = sum(
        v["correct"] + v["wrong"] + v["missing"] for v in field_counts.values()
    )
    total_correct = sum(v["correct"] for v in field_counts.values())
    overall = (total_correct / total_scored * 100) if total_scored else 0.0
    print(f"\n  Overall field accuracy: {overall:.1f}%  ({total_correct}/{total_scored})\n")

    # ---- Per-quality-tier breakdown ----
    tiers = sorted({r.quality_tier for r in ok_results})
    if len(tiers) > 1:
        print(f"  Accuracy by quality tier:\n")
        print(f"  {'Tier':<12} {'Certs':>6} {'Correct':>9} {'Scored':>9} {'Acc %':>8}")
        print(f"  {'-' * 48}")
        for tier in tiers:
            tier_results = [r for r in ok_results if r.quality_tier == tier]
            tc = sum(
                1
                for r in tier_results
                for fr in r.field_results.values()
                if fr.status == "correct"
            )
            ts = sum(
                1
                for r in tier_results
                for fr in r.field_results.values()
                if fr.status in ("correct", "wrong", "missing")
            )
            ta = (tc / ts * 100) if ts else 0.0
            print(
                f"  {tier:<12} {len(tier_results):>6} {tc:>9} {ts:>9} {ta:>7.0f}%"
            )
        print()

    # ---- Per-cert detail (wrong / missing only to keep output short) ----
    misses = [
        r
        for r in ok_results
        if any(fr.status in ("wrong", "missing") for fr in r.field_results.values())
    ]
    if misses:
        print(f"  Wrong / missing extractions:\n")
        for r in misses:
            print(f"    {r.filename}  [{r.quality_tier}]")
            for fname, fr in r.field_results.items():
                if fr.status in ("wrong", "missing"):
                    print(
                        f"      {fname:<22}  {fr.status.upper():<8} "
                        f"got={fr.extracted!r}  want={fr.expected!r}"
                    )

    print(f"{'=' * 70}\n")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run parser accuracy test against certificate images."
    )
    parser.add_argument(
        "--image-dir",
        required=True,
        help="Directory containing certificate images.",
    )
    parser.add_argument(
        "--ground-truth",
        default=None,
        help=(
            "Path to ground_truth.json (default: <image-dir>/ground_truth.json). "
            "If the file does not exist, runs extraction-only mode."
        ),
    )
    parser.add_argument(
        "--report-out",
        default=None,
        help="Where to write accuracy_report.json (default: <image-dir>/accuracy_report.json).",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=_API_DELAY,
        help=f"Seconds to wait between API calls (default: {_API_DELAY}).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Process at most N images (useful for quick smoke tests).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print(
            "ERROR: ANTHROPIC_API_KEY is not set.\n"
            "Export it in your shell or add it to apps/processor/.env before running.",
            file=sys.stderr,
        )
        return 1

    args = _parse_args(argv or sys.argv[1:])

    image_dir = Path(args.image_dir)
    if not image_dir.is_dir():
        print(f"ERROR: --image-dir {image_dir} does not exist.", file=sys.stderr)
        return 1

    # Locate ground truth.
    gt_path = Path(args.ground_truth) if args.ground_truth else image_dir / "ground_truth.json"
    ground_truth: dict[str, dict] = {}
    if gt_path.exists():
        ground_truth = json.loads(gt_path.read_text())
        print(f"Ground truth loaded from {gt_path}  ({len(ground_truth)} entries)")
    else:
        print(f"No ground_truth.json found at {gt_path} — running in extraction-only mode.")

    # Collect image files, sorted for deterministic ordering.
    image_files = sorted(
        p for p in image_dir.iterdir() if p.suffix.lower() in _IMAGE_SUFFIXES
    )
    if args.limit:
        image_files = image_files[: args.limit]

    if not image_files:
        print(f"No image files found in {image_dir}.", file=sys.stderr)
        return 1

    print(f"\nRunning extraction on {len(image_files)} images …\n")

    results: list[CertResult] = []

    for i, img_path in enumerate(image_files, 1):
        tier = _detect_tier(img_path.name)
        print(f"  [{i:02d}/{len(image_files)}] {img_path.name}  [{tier}] … ", end="", flush=True)

        outcome = _run_extraction(img_path)

        if isinstance(outcome, Exception):
            print(f"ERROR: {outcome}")
            results.append(
                CertResult(
                    filename=img_path.name,
                    quality_tier=tier,
                    extracted={},
                    error=str(outcome),
                )
            )
        else:
            print("ok")
            r = CertResult(
                filename=img_path.name,
                quality_tier=tier,
                extracted=outcome.model_dump(),
            )
            if img_path.name in ground_truth:
                _score(r, ground_truth[img_path.name])
            results.append(r)

        if i < len(image_files):
            time.sleep(args.delay)

    # Print report.
    _print_report(results, has_ground_truth=bool(ground_truth))

    # Write JSON report.
    report_out = Path(args.report_out) if args.report_out else image_dir / "accuracy_report.json"
    report_data = {
        "image_dir": str(image_dir),
        "total_certs": len(results),
        "errors": sum(1 for r in results if r.error),
        "results": [
            {
                "filename": r.filename,
                "quality_tier": r.quality_tier,
                "extracted": r.extracted,
                "error": r.error,
                "field_results": {
                    k: asdict(v) for k, v in r.field_results.items()
                },
            }
            for r in results
        ],
    }
    report_out.write_text(json.dumps(report_data, indent=2))
    print(f"Report saved → {report_out}")

    # Exit 0 if overall accuracy ≥ 80%, else 1 (for CI use).
    ok = [r for r in results if not r.error and r.field_results]
    if ok:
        total_scored = sum(
            1
            for r in ok
            for fr in r.field_results.values()
            if fr.status in ("correct", "wrong", "missing")
        )
        total_correct = sum(
            1
            for r in ok
            for fr in r.field_results.values()
            if fr.status == "correct"
        )
        acc = (total_correct / total_scored * 100) if total_scored else 0.0
        return 0 if acc >= 80.0 else 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
