"""
Lambda entry point.

Two event types are handled:
  1. SQS trigger  — document processing (parse a death certificate)
  2. Direct invoke — document generation (render a legal letter template to PDF)
"""

import json
import logging
from typing import Any

from src import api_client, extractor, pdf_processor, s3_client
from src.config import settings

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

    if not records:
        # Direct invocation (e.g. document generation)
        return _handle_generation(event)

    results = []
    for record in records:
        try:
            body: dict[str, Any] = json.loads(record["body"])
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

    logger.info("Processing document", extra={"document_id": document_id, "s3_key": s3_key})

    try:
        # P2-02: Download from S3
        file_bytes = s3_client.download_object(settings.s3_uploads_bucket, s3_key)
        content_type = _content_type_from_key(s3_key)

        # P2-03: Convert to content blocks for Claude
        content = pdf_processor.prepare_content_for_claude(file_bytes, content_type)

        # P2-04 / P2-05: Extract with Claude + validate with Pydantic
        extracted = extractor.extract_certificate_data(content)

        # P2-06: Report success to API
        api_client.report_success(
            document_id,
            extracted.model_dump(exclude_none=True),
        )

        logger.info("Document processed successfully", extra={"document_id": document_id})
        return {"documentId": document_id, "status": "PROCESSED"}

    except Exception as exc:
        # Use only the exception type — not the message — to avoid logging PII
        error_msg = f"Processing failed: {type(exc).__name__}"
        logger.exception("Document processing failed", extra={"document_id": document_id})
        # If report_failure raises (e.g. API unreachable), propagate so SQS can retry / DLQ
        api_client.report_failure(document_id, error_msg)
        return {"documentId": document_id, "status": "FAILED"}


def _handle_generation(event: dict[str, Any]) -> dict[str, Any]:
    """
    Generate a legal document PDF from a template.
    Full implementation in PR #5 (P2-07 to P2-22).
    """
    generated_document_id: str = event["generatedDocumentId"]

    logger.info("Generating document", extra={"generated_document_id": generated_document_id})

    # TODO (P2-07): render Jinja2 template → HTML → PDF via WeasyPrint
    # TODO: upload PDF to S3 + PATCH API callback

    return {"generatedDocumentId": generated_document_id, "status": "stub"}


def _content_type_from_key(s3_key: str) -> str:
    """Derive content type from the S3 key file extension."""
    ext = s3_key.rsplit(".", 1)[-1].lower() if "." in s3_key else ""
    return _CONTENT_TYPE_MAP.get(ext, "application/pdf")
