"""
Historical death certificate downloader for P5-02 accuracy testing.

Downloads public-domain death certificate scans from the Internet Archive.
All items are pre-1950 US vital records digitised by state archives and
genealogical societies — fully in the public domain with no PII concerns.

Usage (from apps/processor/):
    poetry run python scripts/download_historical_certificates.py
    poetry run python scripts/download_historical_certificates.py --out-dir /tmp/hist --count 20

What it does:
  1. Queries the Internet Archive full-text search API for collections that
     contain scanned death certificate images.
  2. For each matching item, fetches its file manifest and picks a JPEG/PNG
     image file that is likely a single certificate page.
  3. Downloads up to --count files (default 20), skipping duplicates.
  4. Writes a metadata.json alongside the images with the IA item identifier,
     collection, title, and source URL for each downloaded file — these serve
     as the "known provenance" record for the accuracy test.

Output:
  <out-dir>/
    hist_001.jpg          (or .png)
    hist_002.jpg
    ...
    metadata.json

Internet Archive collections used (all pre-1950, public domain):
  - "deathcertificates"   — general IA death certificate collection
  - "vital-records"       — state vital records
  - "genealogy"           — genealogical society uploads

No login or API key required for read access to public-domain items.
Rate limiting: 1-second delay between requests to respect IA's guidelines.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from urllib.parse import quote

import httpx

logging.basicConfig(level=logging.INFO, format="%(levelname)s  %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Internet Archive API endpoints
# ---------------------------------------------------------------------------

_IA_SEARCH_URL = "https://archive.org/advancedsearch.php"
_IA_METADATA_URL = "https://archive.org/metadata/{identifier}"
_IA_DOWNLOAD_BASE = "https://archive.org/download/{identifier}/{filename}"

# Image file extensions we accept as certificate page scans.
_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}

# Minimum file size (bytes) — skip thumbnails and tiny previews.
_MIN_FILE_BYTES = 50_000

# Delay between IA API calls (seconds) — be a good citizen.
_REQUEST_DELAY = 1.0

# ---------------------------------------------------------------------------
# Search queries — each targets a different pre-1950 death cert collection.
# ---------------------------------------------------------------------------

_SEARCH_QUERIES = [
    # Standard IA query syntax: subject + mediatype + date range
    (
        'subject:"death certificates" AND mediatype:texts AND year:[1900 TO 1949]',
        30,
    ),
    (
        'subject:"death records" AND mediatype:image AND year:[1900 TO 1940]',
        30,
    ),
    (
        'title:"death certificate" AND mediatype:texts AND year:[1910 TO 1945]',
        20,
    ),
]

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class HistoricalCertMetadata:
    filename: str                  # local filename written to out-dir
    ia_identifier: str             # Internet Archive item ID
    ia_title: str                  # Human-readable title of the IA item
    ia_collection: str | None      # Collection the item belongs to
    ia_file: str                   # Original filename within the IA item
    source_url: str                # Direct download URL
    year: str | None               # Year from IA metadata (approximate)
    description: str | None        # IA item description (may be empty)


# ---------------------------------------------------------------------------
# Internet Archive helpers
# ---------------------------------------------------------------------------


def _search_ia(client: httpx.Client, query: str, rows: int) -> list[dict]:
    """Run an IA advanced search and return a list of result dicts."""
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
        data = resp.json()
        return data.get("response", {}).get("docs", [])
    except Exception as exc:
        logger.warning("Search failed (%s): %s", query[:60], exc)
        return []


def _get_item_files(client: httpx.Client, identifier: str) -> list[dict]:
    """Fetch the file manifest for an IA item."""
    url = _IA_METADATA_URL.format(identifier=identifier)
    try:
        resp = client.get(url, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        return data.get("files", [])
    except Exception as exc:
        logger.warning("Metadata fetch failed for %s: %s", identifier, exc)
        return []


def _pick_image_file(files: list[dict]) -> dict | None:
    """
    Select the best single image file from an IA item's file list.

    Preference order:
      1. JPEG files >= _MIN_FILE_BYTES (most IA scans are JPEGs)
      2. PNG files >= _MIN_FILE_BYTES
      3. TIFF files >= _MIN_FILE_BYTES (large — only as last resort)
    """
    candidates: list[dict] = []
    for f in files:
        name: str = f.get("name", "")
        suffix = Path(name).suffix.lower()
        if suffix not in _IMAGE_EXTENSIONS:
            continue
        size = int(f.get("size", 0))
        if size < _MIN_FILE_BYTES:
            continue
        # Prefer JPEGs; rank TIFFs last (they can be huge).
        rank = {".jpg": 0, ".jpeg": 0, ".png": 1, ".tif": 2, ".tiff": 2}.get(suffix, 3)
        candidates.append({**f, "_rank": rank, "_size": size})

    if not candidates:
        return None
    # Sort: rank ascending, then size descending (prefer larger / higher quality).
    candidates.sort(key=lambda c: (c["_rank"], -c["_size"]))
    return candidates[0]


def _download_file(client: httpx.Client, identifier: str, filename: str) -> bytes | None:
    """Download a single file from an IA item and return its bytes."""
    url = _IA_DOWNLOAD_BASE.format(
        identifier=quote(identifier, safe=""),
        filename=quote(filename, safe=""),
    )
    try:
        with client.stream("GET", url, timeout=60, follow_redirects=True) as resp:
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
        help="Directory to write images and metadata.json (default: scripts/historical_certificates)",
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
        "User-Agent": "AfterLight-P5-02-accuracy-test/1.0 (research; contact: github.com/AfterLight)"
    }

    with httpx.Client(headers=headers) as client:
        for query, rows in _SEARCH_QUERIES:
            if downloaded >= args.count:
                break

            logger.info("Searching IA: %s …", query[:70])
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

                # Fetch file manifest.
                files = _get_item_files(client, identifier)
                time.sleep(_REQUEST_DELAY)

                image_file = _pick_image_file(files)
                if image_file is None:
                    logger.debug("  No suitable image in %s — skipping", identifier)
                    continue

                ia_filename: str = image_file["name"]
                ext = Path(ia_filename).suffix.lower()

                # Download.
                logger.info(
                    "  Downloading %s / %s (%d KB) …",
                    identifier,
                    ia_filename,
                    int(image_file.get("size", 0)) // 1024,
                )
                img_bytes = _download_file(client, identifier, ia_filename)
                time.sleep(_REQUEST_DELAY)

                if img_bytes is None:
                    continue

                # Save locally.
                downloaded += 1
                local_filename = f"hist_{downloaded:03d}{ext}"
                out_path = out_dir / local_filename
                out_path.write_bytes(img_bytes)
                logger.info("  Saved → %s (%d KB)", local_filename, len(img_bytes) // 1024)

                # Record metadata.
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

    # Write metadata.json.
    meta_path = out_dir / "metadata.json"
    meta_path.write_text(
        json.dumps([asdict(r) for r in metadata_records], indent=2)
    )

    logger.info(
        "Done. %d/%d certificates downloaded → %s/",
        downloaded,
        args.count,
        out_dir,
    )
    if downloaded < args.count:
        logger.warning(
            "Only %d certificates found (wanted %d). "
            "IA search results vary — re-run or broaden queries in _SEARCH_QUERIES.",
            downloaded,
            args.count,
        )
    return 0 if downloaded > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
