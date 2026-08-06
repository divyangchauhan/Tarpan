"""
Lambda entry point.

Both job types arrive as SQS records and are routed by message content:
  1. Document processing  — parse a death certificate (carries documentId + s3Key)
  2. Document generation  — render a legal letter template to PDF (carries generatedDocumentId)
"""

import json
import logging
import time
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.aws_lambda import AwsLambdaIntegration

from src import api_client, extractor, pdf_processor, s3_client, template_engine
from src.config import settings
from src.models import GenerationRequest

# Initialize Sentry at module load time so it wraps the Lambda handler.
# No-op when SENTRY_DSN is absent or empty.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        integrations=[AwsLambdaIntegration()],
        traces_sample_rate=0.1,
        # Never capture PII automatically.
        send_default_pii=False,
    )

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

_CONTENT_TYPE_MAP: dict[str, str] = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
    "tiff": "image/tiff",
    "tif": "image/tiff",
}


def handler(event: dict[str, Any], context: object) -> dict[str, Any]:
    """Main Lambda handler — routes SQS records to the appropriate processor."""
    records: list[dict[str, Any]] = event.get("Records", [])

    results = []
    for record in records:
        try:
            body: dict[str, Any] = json.loads(record["body"])
            # Route by message content: generation jobs carry generatedDocumentId,
            # processing jobs carry documentId + s3Key.
            if "generatedDocumentId" in body:
                result = _handle_generation(body)
            else:
                result = _handle_processing(body)
            results.append({"messageId": record["messageId"], "status": "ok", **result})
        except Exception:
            logger.exception(
                "Failed to process SQS record",
                extra={"message_id": record.get("messageId")},
            )
            # Re-raise so SQS routes the message to the DLQ
            raise

    return {"batchItemFailures": [], "results": results}


def _handle_processing(body: dict[str, Any]) -> dict[str, Any]:
    """Download, extract, and report results for a single document."""
    document_id: str = body["documentId"]
    s3_key: str = body["s3Key"]
    t_start = time.monotonic()

    logger.info("Processing document", extra={"document_id": document_id, "s3_key": s3_key})

    try:
        # P2-02: Download from S3
        t0 = time.monotonic()
        file_bytes = s3_client.download_object(settings.s3_uploads_bucket, s3_key)
        content_type = _content_type_from_key(s3_key)
        logger.info(
            "S3 download complete",
            extra={"document_id": document_id, "duration_ms": int((time.monotonic() - t0) * 1000)},
        )

        # P2-03: Convert to content blocks for Claude
        t0 = time.monotonic()
        content = pdf_processor.prepare_content_for_claude(file_bytes, content_type)
        logger.info(
            "PDF preprocessing complete",
            extra={"document_id": document_id, "duration_ms": int((time.monotonic() - t0) * 1000)},
        )

        # P2-04 / P2-05: Extract with Claude + validate with Pydantic
        t0 = time.monotonic()
        extracted = extractor.extract_certificate_data(content)
        logger.info(
            "Claude extraction complete",
            extra={"document_id": document_id, "duration_ms": int((time.monotonic() - t0) * 1000)},
        )

        # P2-06: Report success to API — serialize with camelCase aliases so the
        # stored JSONB matches the TypeScript ExtractedCertificateData interface.
        api_client.report_success(
            document_id,
            extracted.model_dump(by_alias=True, exclude_none=True),
        )

        total_ms = int((time.monotonic() - t_start) * 1000)
        logger.info(
            "Document processed successfully",
            extra={
                "document_id": document_id,
                "total_duration_ms": total_ms,
            },
        )
        return {"documentId": document_id, "status": "PROCESSED"}

    except Exception as exc:
        # Use only the exception type — not the message — to avoid logging PII
        error_msg = f"Processing failed: {type(exc).__name__}"
        logger.exception("Document processing failed", extra={"document_id": document_id})
        # If report_failure raises (e.g. API unreachable), propagate so SQS can retry / DLQ
        api_client.report_failure(document_id, error_msg)
        return {"documentId": document_id, "status": "FAILED"}


def _handle_generation(event: dict[str, Any]) -> dict[str, Any]:
    """Generate a legal document PDF from a template and upload it to S3."""
    # Normalize camelCase event keys to snake_case for Pydantic
    request = GenerationRequest(
        generated_document_id=event["generatedDocumentId"],
        template_id=event["templateId"],
        case_id=event["caseId"],
        deceased=event["deceased"],
        executor_name=event["executorName"],
        executor_address=event["executorAddress"],
        executor_relationship=event["executorRelationship"],
        executor_phone=event.get("executorPhone"),
        executor_email=event.get("executorEmail"),
        institution_name=event.get("institutionName"),
        institution_address=event.get("institutionAddress"),
    )

    t_start = time.monotonic()
    logger.info(
        "Generating document",
        extra={
            "generated_document_id": request.generated_document_id,
            "template_id": request.template_id,
        },
    )

    try:
        t0 = time.monotonic()
        pdf_bytes = template_engine.render(request)
        logger.info(
            "Template rendering complete",
            extra={
                "generated_document_id": request.generated_document_id,
                "duration_ms": int((time.monotonic() - t0) * 1000),
            },
        )

        s3_key = (
            f"generated/{request.case_id}"
            f"/{request.template_id}"
            f"/{request.generated_document_id}.pdf"
        )
        t0 = time.monotonic()
        s3_client.upload_object(
            settings.s3_generated_docs_bucket,
            s3_key,
            pdf_bytes,
            "application/pdf",
        )
        logger.info(
            "S3 upload complete",
            extra={
                "generated_document_id": request.generated_document_id,
                "duration_ms": int((time.monotonic() - t0) * 1000),
            },
        )

    except Exception as exc:
        error_msg = f"Generation failed: {type(exc).__name__}"
        logger.exception(
            "Document generation failed",
            extra={"generated_document_id": request.generated_document_id},
        )
        try:
            api_client.report_generation_failure(request.generated_document_id, error_msg)
        except Exception:
            logger.exception(
                "Failed to report generation failure to API",
                extra={"generated_document_id": request.generated_document_id},
            )
            raise
        return {
            "generatedDocumentId": request.generated_document_id,
            "status": "FAILED",
        }

    # PDF rendered and uploaded to S3 — notify API (best-effort; log warning on failure)
    try:
        api_client.report_generation_success(request.generated_document_id, s3_key)
    except Exception:
        logger.exception(
            "Generated PDF uploaded to S3 but API callback failed",
            extra={
                "generated_document_id": request.generated_document_id,
                "s3_key": s3_key,
            },
        )
        # Delete the artifact before retrying so a transient callback failure
        # cannot leave an untracked PDF behind. Raising also makes SQS retry.
        try:
            s3_client.delete_object(settings.s3_generated_docs_bucket, s3_key)
        except Exception:
            logger.exception(
                "Failed to remove untracked generated PDF",
                extra={"generated_document_id": request.generated_document_id},
            )
        raise

    total_ms = int((time.monotonic() - t_start) * 1000)
    logger.info(
        "Document generated successfully",
        extra={
            "generated_document_id": request.generated_document_id,
            "s3_key": s3_key,
            "total_duration_ms": total_ms,
        },
    )
    return {
        "generatedDocumentId": request.generated_document_id,
        "status": "COMPLETED",
        "s3Key": s3_key,
    }


def _content_type_from_key(s3_key: str) -> str:
    """Derive content type from the S3 key file extension."""
    ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else ""
    return _CONTENT_TYPE_MAP.get(ext, "application/pdf")
