"""Tests for document-to-Claude-content conversion."""

import base64
import io
from unittest.mock import MagicMock, patch

import pytest
from PIL import Image

from src.pdf_processor import (
    _validate_media_type,
    prepare_content_for_claude,
)


def _make_png_bytes() -> bytes:
    """Create a minimal valid PNG in memory."""
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(255, 255, 255)).save(buf, format="PNG")
    return buf.getvalue()


def _make_tiff_bytes() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (10, 10), color=(128, 128, 128)).save(buf, format="TIFF")
    return buf.getvalue()


class TestPrepareContentForClaude:
    def test_png_image_returns_single_image_block(self) -> None:
        png = _make_png_bytes()
        blocks = prepare_content_for_claude(png, "image/png")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "image"
        assert blocks[0]["source"]["media_type"] == "image/png"

    def test_jpeg_image_returns_single_image_block(self) -> None:
        buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(buf, format="JPEG")
        blocks = prepare_content_for_claude(buf.getvalue(), "image/jpeg")
        assert len(blocks) == 1
        assert blocks[0]["source"]["media_type"] == "image/jpeg"

    def test_image_block_is_valid_base64(self) -> None:
        png = _make_png_bytes()
        blocks = prepare_content_for_claude(png, "image/png")
        b64_data: str = blocks[0]["source"]["data"]
        decoded = base64.standard_b64decode(b64_data)
        assert decoded == png

    def test_tiff_converts_to_png_image_block(self) -> None:
        tiff = _make_tiff_bytes()
        blocks = prepare_content_for_claude(tiff, "image/tiff")
        assert len(blocks) == 1
        assert blocks[0]["type"] == "image"
        assert blocks[0]["source"]["media_type"] == "image/png"

    def test_pdf_with_text_returns_text_block(self) -> None:
        long_text = "A" * 300
        mock_page = MagicMock()
        mock_page.extract_text.return_value = long_text

        mock_pdf = MagicMock()
        mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
        mock_pdf.__exit__ = MagicMock(return_value=False)
        mock_pdf.pages = [mock_page]

        with patch("src.pdf_processor.pdfplumber.open", return_value=mock_pdf):
            blocks = prepare_content_for_claude(b"fake-pdf", "application/pdf")

        assert len(blocks) == 1
        assert blocks[0]["type"] == "text"
        assert long_text in blocks[0]["text"]

    def test_pdf_with_no_text_falls_back_to_image(self) -> None:
        mock_page = MagicMock()
        mock_page.extract_text.return_value = ""

        png_buf = io.BytesIO()
        Image.new("RGB", (10, 10)).save(png_buf, format="PNG")
        mock_pil_image = Image.open(io.BytesIO(png_buf.getvalue()))

        page_image_mock = MagicMock()
        page_image_mock.original = mock_pil_image
        mock_page.to_image.return_value = page_image_mock

        mock_pdf = MagicMock()
        mock_pdf.__enter__ = MagicMock(return_value=mock_pdf)
        mock_pdf.__exit__ = MagicMock(return_value=False)
        mock_pdf.pages = [mock_page]

        with patch("src.pdf_processor.pdfplumber.open", return_value=mock_pdf):
            blocks = prepare_content_for_claude(b"fake-scanned-pdf", "application/pdf")

        assert any(b["type"] == "image" for b in blocks)

    def test_unsupported_image_type_raises(self) -> None:
        with pytest.raises(ValueError, match="Unsupported"):
            prepare_content_for_claude(b"data", "image/bmp")


class TestValidateMediaType:
    def test_known_types_return_correct_media_type(self) -> None:
        assert _validate_media_type("image/jpeg") == "image/jpeg"
        assert _validate_media_type("image/jpg") == "image/jpeg"
        assert _validate_media_type("image/png") == "image/png"
        assert _validate_media_type("image/gif") == "image/gif"
        assert _validate_media_type("image/webp") == "image/webp"

    def test_unknown_type_raises(self) -> None:
        with pytest.raises(ValueError):
            _validate_media_type("application/octet-stream")
