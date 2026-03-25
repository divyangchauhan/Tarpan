"""Tests for the Lambda handler routing and processing pipeline."""

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.handler import _content_type_from_key, handler
from src.models import ExtractedCertificateData

_EXTRACTED = ExtractedCertificateData(
    full_name="Robert Smith",
    last_name="Smith",
    date_of_death="2026-02-28",
    place_of_death="Chicago, IL",
)


def _make_sqs_event(body: dict[str, Any]) -> dict[str, Any]:
    return {
        "Records": [
            {
                "messageId": "test-message-id",
                "body": json.dumps(body),
            }
        ]
    }


class _PipelineMocks:
    def __init__(self, extracted: ExtractedCertificateData = _EXTRACTED) -> None:
        self.s3 = MagicMock(download_object=MagicMock(return_value=b"pdf-bytes"))
        self.pdf = MagicMock(
            prepare_content_for_claude=MagicMock(
                return_value=[{"type": "text", "text": "certificate text"}]
            )
        )
        self.ext = MagicMock(extract_certificate_data=MagicMock(return_value=extracted))
        self.api = MagicMock(report_success=MagicMock(), report_failure=MagicMock())
        self._patch = patch.multiple(
            "src.handler",
            s3_client=self.s3,
            pdf_processor=self.pdf,
            extractor=self.ext,
            api_client=self.api,
        )

    def __enter__(self) -> "_PipelineMocks":
        self._patch.__enter__()
        return self

    def __exit__(self, *args: Any) -> None:
        self._patch.__exit__(*args)


class TestHandlerRouting:
    def test_direct_invocation_routes_to_generation(self) -> None:
        event = {"generatedDocumentId": "gen-123"}
        result = handler(event, object())
        assert result["generatedDocumentId"] == "gen-123"
        assert result["status"] == "stub"

    def test_sqs_invocation_routes_to_processing(self) -> None:
        event = _make_sqs_event({"documentId": "doc-123", "s3Key": "uploads/doc-123.pdf"})
        with _PipelineMocks():
            result = handler(event, object())
        assert result["batchItemFailures"] == []
        assert result["results"][0]["documentId"] == "doc-123"

    def test_sqs_reraises_on_infrastructure_failure(self) -> None:
        """If api_client.report_failure itself raises, the SQS record should error."""
        event = _make_sqs_event({"documentId": "doc-123", "s3Key": "uploads/doc-123.pdf"})
        with (
            patch.multiple(
                "src.handler",
                s3_client=MagicMock(download_object=MagicMock(side_effect=RuntimeError("S3 down"))),
                pdf_processor=MagicMock(),
                extractor=MagicMock(),
                api_client=MagicMock(
                    report_failure=MagicMock(side_effect=RuntimeError("API down"))
                ),
            ),
            pytest.raises(RuntimeError, match="API down"),
        ):
            handler(event, object())


class TestHandleProcessing:
    def test_successful_processing_calls_report_success(self) -> None:
        event = _make_sqs_event({"documentId": "doc-456", "s3Key": "cases/doc-456.pdf"})
        with _PipelineMocks() as mocks:
            handler(event, object())
        mocks.api.report_success.assert_called_once()
        assert mocks.api.report_success.call_args[0][0] == "doc-456"

    def test_processing_failure_calls_report_failure(self) -> None:
        event = _make_sqs_event({"documentId": "doc-789", "s3Key": "cases/doc-789.pdf"})
        mock_api = MagicMock(report_success=MagicMock(), report_failure=MagicMock())
        with patch.multiple(
            "src.handler",
            s3_client=MagicMock(download_object=MagicMock(side_effect=ValueError("corrupt file"))),
            pdf_processor=MagicMock(),
            extractor=MagicMock(),
            api_client=mock_api,
        ):
            result = handler(event, object())

        mock_api.report_failure.assert_called_once()
        assert result["results"][0]["status"] == "FAILED"

    def test_result_contains_processed_status_on_success(self) -> None:
        event = _make_sqs_event({"documentId": "doc-ok", "s3Key": "cases/doc-ok.png"})
        with _PipelineMocks():
            result = handler(event, object())
        # _handle_processing returns {"documentId": ..., "status": "PROCESSED"};
        # the outer handler spreads it, so "status" is "PROCESSED" not "ok"
        assert result["results"][0]["status"] == "PROCESSED"


class TestContentTypeFromKey:
    def test_pdf_extension(self) -> None:
        assert _content_type_from_key("cases/abc/doc.pdf") == "application/pdf"

    def test_jpg_extension(self) -> None:
        assert _content_type_from_key("cases/abc/doc.jpg") == "image/jpeg"

    def test_jpeg_extension(self) -> None:
        assert _content_type_from_key("cases/abc/doc.jpeg") == "image/jpeg"

    def test_png_extension(self) -> None:
        assert _content_type_from_key("cases/abc/doc.png") == "image/png"

    def test_tiff_extension(self) -> None:
        assert _content_type_from_key("cases/abc/doc.tiff") == "image/tiff"

    def test_tif_extension(self) -> None:
        assert _content_type_from_key("cases/abc/doc.tif") == "image/tiff"

    def test_unknown_extension_defaults_to_pdf(self) -> None:
        assert _content_type_from_key("cases/abc/doc.bin") == "application/pdf"

    def test_no_extension_defaults_to_pdf(self) -> None:
        assert _content_type_from_key("cases/abc/document") == "application/pdf"
