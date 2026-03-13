"""Convert uploaded documents into content suitable for Claude API."""

import base64
import io
import logging
from typing import Any, Literal

import pdfplumber
from PIL import Image

logger = logging.getLogger(__name__)

# Subset of media types Claude Vision accepts
MediaType = Literal["image/png", "image/jpeg", "image/gif", "image/webp"]

# Minimum characters of extracted text to prefer text over vision
_MIN_TEXT_LENGTH = 200


def prepare_content_for_claude(file_bytes: bytes, content_type: str) -> list[dict[str, Any]]:
    """
    Convert a document into a list of Claude API message content blocks.

    PDFs with extractable text → single text block (faster, cheaper).
    Scanned PDFs or images     → image block(s) for Claude Vision.
    """
    if content_type == "application/pdf":
        text = _extract_pdf_text(file_bytes)
        if len(text.strip()) >= _MIN_TEXT_LENGTH:
            logger.info("Using text extraction for PDF", extra={"text_length": len(text)})
            return [{"type": "text", "text": text}]

        logger.info("PDF has insufficient text; falling back to vision")
        return _pdf_pages_to_image_blocks(file_bytes)

    if content_type == "image/tiff":
        return _tiff_to_image_blocks(file_bytes)

    media_type = _validate_media_type(content_type)
    encoded = base64.standard_b64encode(file_bytes).decode()
    return [_image_block(encoded, media_type)]


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract all text from a PDF using pdfplumber."""
    pages: list[str] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            pages.append(text)
    return "\n\n".join(pages)


def _pdf_pages_to_image_blocks(pdf_bytes: bytes) -> list[dict[str, Any]]:
    """Render each PDF page to a PNG image block for Claude Vision."""
    blocks: list[dict[str, Any]] = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        logger.info("Rendering PDF pages", extra={"page_count": len(pdf.pages)})
        for i, page in enumerate(pdf.pages):
            pil_image = page.to_image(resolution=150).original
            buf = io.BytesIO()
            pil_image.save(buf, format="PNG")
            encoded = base64.standard_b64encode(buf.getvalue()).decode()
            if i > 0:
                blocks.append({"type": "text", "text": f"Page {i + 1}:"})
            blocks.append(_image_block(encoded, "image/png"))
    return blocks


def _tiff_to_image_blocks(tiff_bytes: bytes) -> list[dict[str, Any]]:
    """Convert a (possibly multi-frame) TIFF to PNG image blocks."""
    blocks: list[dict[str, Any]] = []
    img = Image.open(io.BytesIO(tiff_bytes))
    n_frames: int = getattr(img, "n_frames", 1)
    for i in range(n_frames):
        img.seek(i)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG")
        encoded = base64.standard_b64encode(buf.getvalue()).decode()
        if i > 0:
            blocks.append({"type": "text", "text": f"Page {i + 1}:"})
        blocks.append(_image_block(encoded, "image/png"))
    img.close()
    return blocks


def _image_block(b64_data: str, media_type: MediaType) -> dict[str, Any]:
    return {
        "type": "image",
        "source": {"type": "base64", "media_type": media_type, "data": b64_data},
    }


def _validate_media_type(content_type: str) -> MediaType:
    mapping: dict[str, MediaType] = {
        "image/jpeg": "image/jpeg",
        "image/jpg": "image/jpeg",
        "image/png": "image/png",
        "image/gif": "image/gif",
        "image/webp": "image/webp",
    }
    result = mapping.get(content_type)
    if result is None:
        raise ValueError(f"Unsupported image content type: {content_type}")
    return result
