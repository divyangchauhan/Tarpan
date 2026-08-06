"""Tests for the Lambda handler routing and processing pipeline."""

import json
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.handler import _content_type_from_key, _handle_generation, handler
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


def _make_generation_event(generated_document_id: str = "gen-123") -> dict[str, Any]:
    return {
        "generatedDocumentId": generated_document_id,
        "templateId": "ssa-721",
        "caseId": "case-abc",
        "deceased": {
            "full_name": "Robert Smith",
            "last_name": "Smith",
            "date_of_death": "2026-02-28",
            "place_of_death": "Chicago, IL",
        },
        "executorName": "Alice Smith",
        "executorAddress": "123 Main St\nChicago, IL 60601",
        "executorRelationship": "Spouse",
    }


class TestHandlerRouting:
    def test_sqs_invocation_routes_to_generation(self) -> None:
        fake_pdf = b"%PDF-1.4 fake"
        mock_html_instance = MagicMock()
        mock_html_instance.write_pdf.return_value = fake_pdf

        event = _make_sqs_event(_make_generation_event())
        with (
            patch("src.template_engine.HTML", return_value=mock_html_instance),
            patch("src.handler.s3_client.upload_object"),
            patch("src.handler.api_client.report_generation_success"),
        ):
            result = handler(event, object())

        assert result["results"][0]["generatedDocumentId"] == "gen-123"
        assert result["results"][0]["status"] == "COMPLETED"

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


class TestHandleGeneration:
    def _patch_gen(
        self,
        *,
        render_side_effect: Any = None,
        upload_side_effect: Any = None,
        success_side_effect: Any = None,
        failure_side_effect: Any = None,
    ) -> Any:
        fake_pdf = b"%PDF-1.4 fake"
        mock_html = MagicMock()
        mock_html.write_pdf.return_value = fake_pdf

        render = MagicMock(return_value=fake_pdf)
        if render_side_effect is not None:
            render.side_effect = render_side_effect

        upload = MagicMock()
        if upload_side_effect is not None:
            upload.side_effect = upload_side_effect

        report_success = MagicMock()
        if success_side_effect is not None:
            report_success.side_effect = success_side_effect

        report_failure = MagicMock()
        if failure_side_effect is not None:
            report_failure.side_effect = failure_side_effect

        return patch.multiple(
            "src.handler",
            template_engine=MagicMock(render=render),
            s3_client=MagicMock(upload_object=upload),
            api_client=MagicMock(
                report_generation_success=report_success,
                report_generation_failure=report_failure,
            ),
        )

    def test_successful_generation_returns_completed(self) -> None:
        with self._patch_gen():
            result = _handle_generation(_make_generation_event())
        assert result["status"] == "COMPLETED"
        assert result["generatedDocumentId"] == "gen-123"
        assert "s3Key" in result

    def test_api_callback_failure_raises_for_sqs_retry(self) -> None:
        """A failed callback must retry instead of leaving the DB GENERATING."""
        s3 = MagicMock(upload_object=MagicMock())
        with (
            self._patch_gen(success_side_effect=RuntimeError("timeout")),
            patch("src.handler.s3_client", s3),
            pytest.raises(RuntimeError, match="timeout"),
        ):
            _handle_generation(_make_generation_event())
        s3.delete_object.assert_not_called()

    def test_generation_dlq_record_reports_terminal_failure(self) -> None:
        event = _make_sqs_event(_make_generation_event("gen-dlq"))
        event["Records"][0]["eventSourceARN"] = "arn:aws:sqs:us-east-1:123:generation-dlq"
        with (
            patch("src.handler.settings.generation_dlq_arn", event["Records"][0]["eventSourceARN"]),
            patch("src.handler.api_client.report_generation_failure") as report_failure,
        ):
            result = handler(event, object())

        report_failure.assert_called_once_with(
            "gen-dlq", "Generation job exhausted retries before completion"
        )
        assert result["results"][0]["status"] == "FAILED"

    def test_render_failure_returns_failed(self) -> None:
        with self._patch_gen(render_side_effect=RuntimeError("WeasyPrint crash")):
            result = _handle_generation(_make_generation_event())
        assert result["status"] == "FAILED"

    def test_render_failure_calls_report_generation_failure(self) -> None:
        mock_api = MagicMock(
            report_generation_success=MagicMock(),
            report_generation_failure=MagicMock(),
        )
        with patch.multiple(
            "src.handler",
            template_engine=MagicMock(render=MagicMock(side_effect=RuntimeError("crash"))),
            s3_client=MagicMock(upload_object=MagicMock()),
            api_client=mock_api,
        ):
            _handle_generation(_make_generation_event("gen-xyz"))
        mock_api.report_generation_failure.assert_called_once()
        assert mock_api.report_generation_failure.call_args[0][0] == "gen-xyz"

    def test_report_failure_raising_propagates_for_sqs_retry(self) -> None:
        """If the failure callback itself errors, the handler must retry."""
        with (
            self._patch_gen(
                render_side_effect=RuntimeError("crash"),
                failure_side_effect=RuntimeError("API also down"),
            ),
            pytest.raises(RuntimeError, match="API also down"),
        ):
            _handle_generation(_make_generation_event())


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
