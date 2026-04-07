"""
Historical death certificate downloader for P5-02 accuracy testing.

Downloads public-domain death certificate scans from the Internet Archive.
All items are pre-1950 US vital records digitised by state archives and
genealogical societies — fully in the public domain with no PII concerns.

Usage (from apps/processor/):
    poetry run python scripts/download_historical_certificates.py
    poetry run python scripts/download_historical_certificates.py --out-dir /tmp/hist --count 20

What it does:
  1. Queries the Internet Archive search API using several queries that
     target genealogy and vital-records collections.
  2. For each matching item, fetches its file manifest and picks the best
     scannable file: JPEG/PNG/TIFF preferred; PDF and JP2 (JPEG 2000)
     also accepted and converted to JPEG automatically.
  3. Downloads up to --count files, skipping duplicates.
  4. Writes metadata.json alongside the images.

No login or API key required. 1-second delay between requests.
"""

from __future__ import annotations

import argparse
import io
import json
import logging
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import quote

import httpx
import pdfplumber
from PIL import Image

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internet Archive API
# ---------------------------------------------------------------------------

_IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
_IA_METADATA_URL = "https://archive.org/metadata/{identifier}"
_IA_DOWNLOAD_BASE = "https://archive.org/download/{identifier}/{filename}"

# Minimum file size — skip thumbnails / tiny previews.
_MIN_FILE_BYTES = 30_000

_REQUEST_DELAY = 1.0  # seconds between IA calls

# ---------------------------------------------------------------------------
# File format support
# ---------------------------------------------------------------------------

# Native image formats Claude Vision accepts directly.
_NATIVE_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}

# Formats we download and convert to JPEG before saving.
_CONVERTIBLE_EXTS = {".pdf", ".jp2", ".jpx", ".j2k", ".j2c"}

_ALL_ACCEPTED_EXTS = _NATIVE_IMAGE_EXTS | _CONVERTIBLE_EXTS

# Rank for picking the best file (lower = better).
_EXT_RANK: dict[str, int] = {
    ".jpg": 0, ".jpeg": 0,
    ".png": 1,
    ".tif": 2, ".tiff": 2,
    ".jp2": 3, ".jpx": 3, ".j2k": 3, ".j2c": 3,
    ".pdf": 4,  # last resort — we extract one page
}

# ---------------------------------------------------------------------------
# Search queries — targeted at US death certificate scans specifically.
# ---------------------------------------------------------------------------

_SEARCH_QUERIES: list[tuple[str, int]] = [
    # Direct title match — most precise
    (
        'title:"death certificate" AND language:eng AND year:[1900 TO 1950]',
        50,
    ),
    # Certificate of death phrasing used on older US forms
    (
        'title:"certificate of death" AND language:eng AND year:[1880 TO 1950]',
        50,
    ),
    # US vital records / registers
    (
        'subject:"Death certificates" AND subject:"United States" AND year:[1880 TO 1950]',
        50,
    ),
    # County/state genealogy uploads to IA
    (
        'subject:"death records" AND language:eng AND subject:"United States"',
        50,
    ),
    # Broader fallback — individual record scans from US genealogy projects
    (
        'title:("death record" OR "death register") AND language:eng AND year:[1880 TO 1950]',
        50,
    ),
]

# Words in item titles that indicate a reference book / statistical report
# rather than an actual scanned certificate — skip these.
_TITLE_BLOCKLIST = {
    "handbook", "guide", "manual", "gazetteer", "statistics", "statistical",
    "report", "bulletin", "journal", "proceedings", "abstract", "index",
    "annual", "biennial", "survey", "directory", "catalogue", "catalog",
    "history", "register of", "introduction", "instructions", "regulations",
}


def _looks_like_cert_item(title: str) -> bool:
    """
    Return True if the IA item title suggests an actual scanned death certificate
    rather than a reference book, statistical report, or gazette.
    """
    lower = title.lower()
    # Must contain at least one certificate-related keyword.
    has_cert_word = any(
        w in lower
        for w in ("death certificate", "certificate of death", "death record",
                  "death register", "vital record", "mortality record")
    )
    # Must not be a reference/statistical publication.
    has_block_word = any(w in lower for w in _TITLE_BLOCKLIST)
    return has_cert_word or not has_block_word

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class HistoricalCertMetadata:
    filename: str
    ia_identifier: str
    ia_title: str
    ia_collection: str | None
    ia_file: str
    source_url: str
    year: str | None
    description: str | None


# ---------------------------------------------------------------------------
# File conversion helpers
# ---------------------------------------------------------------------------


def _pdf_to_jpeg(pdf_bytes: bytes) -> bytes | None:
    """Convert the first page of a PDF to JPEG bytes using pdfplumber."""
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                return None
            img = pdf.pages[0].to_image(resolution=150).original.convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            return buf.getvalue()
    except Exception as exc:
        logger.debug("PDF→JPEG conversion failed: %s", exc)
        return None


def _jp2_to_jpeg(jp2_bytes: bytes) -> bytes | None:
    """Convert a JPEG 2000 image to JPEG bytes using Pillow."""
    try:
        img = Image.open(io.BytesIO(jp2_bytes)).convert("RGB")
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return buf.getvalue()
    except Exception as exc:
        logger.debug("JP2→JPEG conversion failed: %s", exc)
        return None


def _to_jpeg_if_needed(raw_bytes: bytes, ext: str) -> bytes | None:
    """
    Return JPEG bytes regardless of the original file format.
    Returns None if conversion fails.
    """
    if ext in {".jpg", ".jpeg"}:
        return raw_bytes
    if ext in {".png", ".tif", ".tiff"}:
        try:
            img = Image.open(io.BytesIO(raw_bytes)).convert("RGB")
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=90)
            return buf.getvalue()
        except Exception as exc:
            logger.debug("Image→JPEG conversion failed: %s", exc)
            return None
    if ext == ".pdf":
        return _pdf_to_jpeg(raw_bytes)
    if ext in {".jp2", ".jpx", ".j2k", ".j2c"}:
        return _jp2_to_jpeg(raw_bytes)
    return None


# ---------------------------------------------------------------------------
# Internet Archive helpers
# ---------------------------------------------------------------------------


def _search_ia(client: httpx.Client, query: str, rows: int) -> list[dict]:
    params = {
        "q": query,
        "fl[]": ["identifier", "title", "year", "collection", "description"],
        "rows": rows,
        "page": 1,
        "output": "json",
    }
    try:
        resp = client.get(_IA_SEARCH_URL, params=params, timeout=20)
        resp.raise_for_status()
        return resp.json().get("response", {}).get("docs", [])
    except Exception as exc:
        logger.warning("Search failed: %s", exc)
        return []


def _get_item_files(client: httpx.Client, identifier: str) -> list[dict]:
    url = _IA_METADATA_URL.format(identifier=identifier)
    try:
        resp = client.get(url, timeout=20)
        resp.raise_for_status()
        return resp.json().get("files", [])
    except Exception as exc:
        logger.warning("Metadata fetch failed for %s: %s", identifier, exc)
        return []


def _pick_file(files: list[dict]) -> dict | None:
    """
    Pick the best scannable file from an IA item manifest.

    Accepts native images (JPEG, PNG, TIFF), JP2, and PDF.
    Prefers native images; uses PDF / JP2 as fallback.
    Skips thumbnails, OCR sidecars, and files below _MIN_FILE_BYTES.
    """
    candidates: list[dict] = []
    for f in files:
        name: str = f.get("name", "")
        suffix = Path(name).suffix.lower()
        if suffix not in _ALL_ACCEPTED_EXTS:
            continue
        # Skip derivative/sidecar files IA generates automatically.
        if any(
            tag in name.lower()
            for tag in ("_thumb", "thumbs", "_small", "_medium", "metadata", "djvu", "ocr")
        ):
            continue
        size = int(f.get("size", 0))
        if size < _MIN_FILE_BYTES:
            continue
        rank = _EXT_RANK.get(suffix, 99)
        candidates.append({**f, "_rank": rank, "_size": size})

    if not candidates:
        return None
    candidates.sort(key=lambda c: (c["_rank"], -c["_size"]))
    return candidates[0]


def _download_bytes(client: httpx.Client, identifier: str, filename: str) -> bytes | None:
    url = _IA_DOWNLOAD_BASE.format(
        identifier=quote(identifier, safe=""),
        filename=quote(filename, safe=""),
    )
    try:
        with client.stream("GET", url, timeout=120, follow_redirects=True) as resp:
            resp.raise_for_status()
            return resp.read()
    except Exception as exc:
        logger.warning("Download failed %s/%s: %s", identifier, filename, exc)
        return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def _parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Download historical public-domain death certificate scans from Internet Archive."
    )
    parser.add_argument(
        "--out-dir",
        default="scripts/historical_certificates",
        help="Output directory (default: scripts/historical_certificates)",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=20,
        help="Number of certificate images to download (default: 20)",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv or sys.argv[1:])

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    metadata_records: list[HistoricalCertMetadata] = []
    seen_identifiers: set[str] = set()
    downloaded = 0

    headers = {
        "User-Agent": (
            "AfterLight-P5-02-accuracy-test/1.0 "
            "(genealogy research; contact: github.com/AfterLight)"
        )
    }

    with httpx.Client(headers=headers) as client:
        for query, rows in _SEARCH_QUERIES:
            if downloaded >= args.count:
                break

            logger.info("Searching IA: %s …", query[:80])
            results = _search_ia(client, query, rows)
            logger.info("  → %d results", len(results))
            time.sleep(_REQUEST_DELAY)

            for item in results:
                if downloaded >= args.count:
                    break

                identifier: str = item.get("identifier", "")
                if not identifier or identifier in seen_identifiers:
                    continue
                seen_identifiers.add(identifier)

                title: str = item.get("title", "")
                if not _looks_like_cert_item(title):
                    logger.debug("  Skipping non-cert item: %s — %s", identifier, title[:60])
                    continue

                files = _get_item_files(client, identifier)
                time.sleep(_REQUEST_DELAY)

                chosen = _pick_file(files)
                if chosen is None:
                    logger.debug("  No usable file in %s — skipping", identifier)
                    continue

                ia_filename: str = chosen["name"]
                ext = Path(ia_filename).suffix.lower()
                size_kb = int(chosen.get("size", 0)) // 1024

                logger.info(
                    "  Downloading %s / %s (%d KB, %s) …",
                    identifier,
                    ia_filename,
                    size_kb,
                    ext,
                )
                raw_bytes = _download_bytes(client, identifier, ia_filename)
                time.sleep(_REQUEST_DELAY)

                if raw_bytes is None:
                    continue

                # Convert to JPEG if the original is PDF / JP2 / other.
                jpeg_bytes = _to_jpeg_if_needed(raw_bytes, ext)
                if jpeg_bytes is None:
                    logger.warning("  Conversion failed for %s — skipping", ia_filename)
                    continue

                downloaded += 1
                local_filename = f"hist_{downloaded:03d}.jpg"
                (out_dir / local_filename).write_bytes(jpeg_bytes)
                logger.info(
                    "  Saved → %s (%d KB)",
                    local_filename,
                    len(jpeg_bytes) // 1024,
                )

                collection = item.get("collection")
                if isinstance(collection, list):
                    collection = collection[0] if collection else None

                metadata_records.append(
                    HistoricalCertMetadata(
                        filename=local_filename,
                        ia_identifier=identifier,
                        ia_title=item.get("title", ""),
                        ia_collection=collection,
                        ia_file=ia_filename,
                        source_url=_IA_DOWNLOAD_BASE.format(
                            identifier=quote(identifier, safe=""),
                            filename=quote(ia_filename, safe=""),
                        ),
                        year=str(item.get("year", "")) or None,
                        description=item.get("description") or None,
                    )
                )

    (out_dir / "metadata.json").write_text(
        json.dumps([asdict(r) for r in metadata_records], indent=2)
    )

    logger.info("Done. %d/%d downloaded → %s/", downloaded, args.count, out_dir)
    if downloaded < args.count:
        logger.warning(
            "Only %d found (wanted %d). IA availability varies — try re-running.",
            downloaded,
            args.count,
        )
    return 0 if downloaded > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
