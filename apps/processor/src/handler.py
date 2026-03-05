"""
Lambda entry point.

Two event types are handled:
  1. SQS trigger  — document processing (parse a death certificate)
  2. Direct invoke — document generation (render a legal letter template to PDF)
"""
import json
import logging
from typing import Any

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


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
    """
    Process a death certificate upload.
    Full implementation in PR #4 (P2-01 to P2-06).
    """
    document_id: str = body["documentId"]
    s3_key: str = body["s3Key"]

    logger.info("Processing document", extra={"document_id": document_id, "s3_key": s3_key})

    # TODO (P2-03): pre-process PDF/image
    # TODO (P2-04): call Claude API for extraction
    # TODO (P2-05): validate extracted data with Pydantic
    # TODO (P2-06): upload result to S3 + PATCH API callback

    return {"documentId": document_id, "status": "stub"}


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
