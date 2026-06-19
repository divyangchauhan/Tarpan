"""
Integration tests — handler runs against real moto S3 and SQS.

Unit tests mock all AWS calls at the module level. These tests let the
actual s3_client module execute real boto3 calls against moto, verifying
bucket names, key formats, content-type headers, and binary round-trips
in addition to application logic.

Still mocked (external / expensive):
  - Claude extractor   (real API key + latency)
  - WeasyPrint renderer (heavy native dependency)
  - API HTTP callbacks  (NestJS not running in tests)
"""

import json
from typing import Any
from unittest.mock import patch

import boto3
import pytest
from moto import mock_aws

from src.handler import handler
from src.models import ExtractedCertificateData

# ---------------------------------------------------------------------------
# Shared test data
# ---------------------------------------------------------------------------

_UPLOADS_BUCKET = "tarpan-uploads"
_GENERATED_BUCKET = "tarpan-generated-docs"

_EXTRACTED = ExtractedCertificateData(
    full_name="Jane Smith",
    last_name="Smith",
    date_of_death="2024-11-03",
    place_of_death="Springfield, IL",
)

_FAKE_PDF = b"%PDF-1.4 fake-certificate-bytes"
_FAKE_RENDERED_PDF = b"%PDF-1.4 fake-rendered-letter"


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def aws(monkeypatch: pytest.MonkeyPatch) -> Any:
    """
    Start moto and create the two S3 buckets and two SQS queues used by the
    processor. Yields a dict with pre-built boto3 clients and queue URLs.
    """
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    monkeypatch.setenv("AWS_DEFAULT_REGION", "us-east-1")
    # Clear LocalStack endpoint so moto intercepts boto3 calls (same as conftest).
    monkeypatch.setenv("AWS_ENDPOINT_URL", "")

    with mock_aws():
        s3 = boto3.client("s3", region_name="us-east-1")
        s3.create_bucket(Bucket=_UPLOADS_BUCKET)
        s3.create_bucket(Bucket=_GENERATED_BUCKET)

        sqs = boto3.client("sqs", region_name="us-east-1")
        proc_q = sqs.create_queue(QueueName="tarpan-document-processing")
        gen_q = sqs.create_queue(QueueName="tarpan-document-generation")

        yield {
            "s3": s3,
            "sqs": sqs,
            "processing_queue_url": proc_q["QueueUrl"],
            "generation_queue_url": gen_q["QueueUrl"],
        }


def _sqs_event(body: dict[str, Any], message_id: str = "msg-001") -> dict[str, Any]:
    """Wrap a dict as a Lambda SQS event record."""
    return {
        "Records": [
            {
                "messageId": message_id,
                "body": json.dumps(body),
            }
        ]
    }


def _generation_event(
    generated_document_id: str = "gen-001",
    template_id: str = "ssa-721",
    case_id: str = "case-abc",
) -> dict[str, Any]:
    return {
        "generatedDocumentId": generated_document_id,
        "templateId": template_id,
        "caseId": case_id,
        "deceased": {
            "full_name": "Jane Smith",
            "last_name": "Smith",
            "date_of_death": "2024-11-03",
            "place_of_death": "Springfield, IL",
        },
        "executorName": "Bob Smith",
        "executorAddress": "412 Maple Ave\nSpringfield, IL 62704",
        "executorRelationship": "Son",
    }


# ---------------------------------------------------------------------------
# Processing pipeline integration tests
# ---------------------------------------------------------------------------


class TestProcessingIntegration:
    def test_successful_processing_downloads_from_real_s3(self, aws: Any) -> None:
        """Handler downloads the file from moto S3, extracts data, and calls the API."""
        s3_key = "cases/case-abc/documents/cert.pdf"
        aws["s3"].put_object(Bucket=_UPLOADS_BUCKET, Key=s3_key, Body=_FAKE_PDF)

        event = _sqs_event({"documentId": "doc-001", "s3Key": s3_key})

        with (
            patch("src.handler.pdf_processor") as mock_pdf,
            patch("src.handler.extractor") as mock_ext,
            patch("src.handler.api_client") as mock_api,
        ):
            mock_pdf.prepare_content_for_claude.return_value = [
                {"type": "text", "text": "certificate text"}
            ]
            mock_ext.extract_certificate_data.return_value = _EXTRACTED

            result = handler(event, object())

        assert result["batchItemFailures"] == []
        assert result["results"][0]["status"] == "PROCESSED"
        mock_api.report_success.assert_called_once_with(
            "doc-001", _EXTRACTED.model_dump(by_alias=True, exclude_none=True)
        )

    def test_processing_passes_correct_bytes_to_pdf_processor(self, aws: Any) -> None:
        """The bytes downloaded from S3 are passed unchanged to the PDF preprocessor."""
        s3_key = "cases/case-abc/documents/cert.pdf"
        aws["s3"].put_object(Bucket=_UPLOADS_BUCKET, Key=s3_key, Body=_FAKE_PDF)

        event = _sqs_event({"documentId": "doc-002", "s3Key": s3_key})

        with (
            patch("src.handler.pdf_processor") as mock_pdf,
            patch("src.handler.extractor") as mock_ext,
            patch("src.handler.api_client"),
        ):
            mock_pdf.prepare_content_for_claude.return_value = []
            mock_ext.extract_certificate_data.return_value = _EXTRACTED

            handler(event, object())

        # First positional arg to prepare_content_for_claude should be the raw bytes
        called_bytes = mock_pdf.prepare_content_for_claude.call_args[0][0]
        assert called_bytes == _FAKE_PDF

    def test_missing_s3_object_returns_failed_status(self, aws: Any) -> None:
        """A missing S3 key causes FAILED status, not an unhandled exception."""
        event = _sqs_event({"documentId": "doc-003", "s3Key": "cases/nonexistent.pdf"})

        with patch("src.handler.api_client") as mock_api:
            result = handler(event, object())

        assert result["results"][0]["status"] == "FAILED"
        mock_api.report_failure.assert_called_once()
        assert "doc-003" in mock_api.report_failure.call_args[0]

    def test_content_type_derived_from_s3_key_extension(self, aws: Any) -> None:
        """Content type passed to PDF processor matches the S3 key extension."""
        for ext, expected_ct in [
            ("pdf", "application/pdf"),
            ("jpg", "image/jpeg"),
            ("png", "image/png"),
        ]:
            s3_key = f"cases/case-abc/documents/cert.{ext}"
            aws["s3"].put_object(Bucket=_UPLOADS_BUCKET, Key=s3_key, Body=_FAKE_PDF)
            event = _sqs_event({"documentId": f"doc-{ext}", "s3Key": s3_key})

            with (
                patch("src.handler.pdf_processor") as mock_pdf,
                patch("src.handler.extractor") as mock_ext,
                patch("src.handler.api_client"),
            ):
                mock_pdf.prepare_content_for_claude.return_value = []
                mock_ext.extract_certificate_data.return_value = _EXTRACTED
                handler(event, object())

            called_ct = mock_pdf.prepare_content_for_claude.call_args[0][1]
            assert called_ct == expected_ct, f"Expected {expected_ct} for .{ext}"


# ---------------------------------------------------------------------------
# Generation pipeline integration tests
# ---------------------------------------------------------------------------


class TestGenerationIntegration:
    def test_successful_generation_uploads_pdf_to_real_s3(self, aws: Any) -> None:
        """Generated PDF bytes are uploaded to the correct S3 key in moto."""
        event = _generation_event(
            generated_document_id="gen-001",
            template_id="ssa-721",
            case_id="case-abc",
        )

        with (
            patch("src.handler.template_engine") as mock_tpl,
            patch("src.handler.api_client"),
        ):
            mock_tpl.render.return_value = _FAKE_RENDERED_PDF
            result = handler(_sqs_event(event), object())

        assert result["results"][0]["status"] == "COMPLETED"

        expected_key = "generated/case-abc/ssa-721/gen-001.pdf"
        obj = aws["s3"].get_object(Bucket=_GENERATED_BUCKET, Key=expected_key)
        assert obj["Body"].read() == _FAKE_RENDERED_PDF
        assert obj["ContentType"] == "application/pdf"

    def test_generation_s3_key_format(self, aws: Any) -> None:
        """S3 key follows the pattern generated/{case_id}/{template_id}/{gen_doc_id}.pdf."""
        event = _generation_event(
            generated_document_id="gen-xyz",
            template_id="bank-closure",
            case_id="case-999",
        )

        with (
            patch("src.handler.template_engine") as mock_tpl,
            patch("src.handler.api_client"),
        ):
            mock_tpl.render.return_value = _FAKE_RENDERED_PDF
            result = handler(_sqs_event(event), object())

        assert result["results"][0]["s3Key"] == "generated/case-999/bank-closure/gen-xyz.pdf"

    def test_generation_calls_api_success_callback_with_s3_key(self, aws: Any) -> None:
        """On success the handler reports the S3 key back to the API."""
        event = _generation_event(generated_document_id="gen-cb", case_id="case-cb")

        with (
            patch("src.handler.template_engine") as mock_tpl,
            patch("src.handler.api_client") as mock_api,
        ):
            mock_tpl.render.return_value = _FAKE_RENDERED_PDF
            handler(_sqs_event(event), object())

        mock_api.report_generation_success.assert_called_once_with(
            "gen-cb", "generated/case-cb/ssa-721/gen-cb.pdf"
        )

    def test_render_failure_does_not_upload_to_s3(self, aws: Any) -> None:
        """If rendering fails nothing is written to S3."""
        event = _generation_event(generated_document_id="gen-fail", case_id="case-fail")

        with (
            patch("src.handler.template_engine") as mock_tpl,
            patch("src.handler.api_client"),
        ):
            mock_tpl.render.side_effect = RuntimeError("WeasyPrint crash")
            result = handler(_sqs_event(event), object())

        assert result["results"][0]["status"] == "FAILED"
        objects = aws["s3"].list_objects_v2(Bucket=_GENERATED_BUCKET)
        assert objects.get("KeyCount", 0) == 0

    def test_render_failure_calls_api_failure_callback(self, aws: Any) -> None:
        """Render failure triggers the generation failure callback."""
        event = _generation_event(generated_document_id="gen-fail2")

        with (
            patch("src.handler.template_engine") as mock_tpl,
            patch("src.handler.api_client") as mock_api,
        ):
            mock_tpl.render.side_effect = RuntimeError("crash")
            handler(_sqs_event(event), object())

        mock_api.report_generation_failure.assert_called_once()
        assert mock_api.report_generation_failure.call_args[0][0] == "gen-fail2"


# ---------------------------------------------------------------------------
# SQS round-trip integration tests
# ---------------------------------------------------------------------------


class TestSqsRoundTrip:
    def test_processing_message_survives_sqs_round_trip(self, aws: Any) -> None:
        """A message put on the SQS queue can be received and drives the handler."""
        s3_key = "cases/case-sqs/documents/cert.pdf"
        aws["s3"].put_object(Bucket=_UPLOADS_BUCKET, Key=s3_key, Body=_FAKE_PDF)

        # Publish message the way the NestJS API would
        body = {"documentId": "doc-sqs", "s3Key": s3_key}
        aws["sqs"].send_message(
            QueueUrl=aws["processing_queue_url"],
            MessageBody=json.dumps(body),
        )

        # Receive the way the Lambda SQS trigger would deliver it
        response = aws["sqs"].receive_message(
            QueueUrl=aws["processing_queue_url"], MaxNumberOfMessages=1
        )
        messages = response.get("Messages", [])
        assert len(messages) == 1

        lambda_event = {
            "Records": [
                {
                    "messageId": messages[0]["MessageId"],
                    "body": messages[0]["Body"],
                }
            ]
        }

        with (
            patch("src.handler.pdf_processor") as mock_pdf,
            patch("src.handler.extractor") as mock_ext,
            patch("src.handler.api_client"),
        ):
            mock_pdf.prepare_content_for_claude.return_value = []
            mock_ext.extract_certificate_data.return_value = _EXTRACTED
            result = handler(lambda_event, object())

        assert result["results"][0]["status"] == "PROCESSED"

    def test_generation_message_survives_sqs_round_trip(self, aws: Any) -> None:
        """A generation message put on SQS can be received and drives the handler."""
        gen_body = _generation_event(generated_document_id="gen-sqs")
        aws["sqs"].send_message(
            QueueUrl=aws["generation_queue_url"],
            MessageBody=json.dumps(gen_body),
        )

        response = aws["sqs"].receive_message(
            QueueUrl=aws["generation_queue_url"], MaxNumberOfMessages=1
        )
        messages = response["Messages"]

        lambda_event = {
            "Records": [
                {
                    "messageId": messages[0]["MessageId"],
                    "body": messages[0]["Body"],
                }
            ]
        }

        with (
            patch("src.handler.template_engine") as mock_tpl,
            patch("src.handler.api_client"),
        ):
            mock_tpl.render.return_value = _FAKE_RENDERED_PDF
            result = handler(lambda_event, object())

        assert result["results"][0]["status"] == "COMPLETED"
        # Verify the PDF actually landed in S3
        obj = aws["s3"].get_object(
            Bucket=_GENERATED_BUCKET, Key="generated/case-abc/ssa-721/gen-sqs.pdf"
        )
        assert obj["Body"].read() == _FAKE_RENDERED_PDF
