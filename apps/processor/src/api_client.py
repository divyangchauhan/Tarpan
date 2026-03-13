"""HTTP client for reporting processing results back to the NestJS API."""

import logging
from typing import Any

import httpx

from src.config import settings

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 30.0


def report_success(document_id: str, extracted_data: dict[str, Any]) -> None:
    """Report a successful extraction result to the API."""
    _patch_processing_result(
        document_id=document_id,
        status="PROCESSED",
        extracted_data=extracted_data,
    )


def report_failure(document_id: str, error_message: str) -> None:
    """Report a processing failure to the API."""
    _patch_processing_result(
        document_id=document_id,
        status="FAILED",
        error_message=error_message,
    )


def _patch_processing_result(
    document_id: str,
    status: str,
    extracted_data: dict[str, Any] | None = None,
    error_message: str | None = None,
) -> None:
    url = f"{settings.api_callback_url}/api/v1/documents/{document_id}/processing-result"
    payload: dict[str, Any] = {"documentId": document_id, "status": status}
    if extracted_data is not None:
        payload["extractedData"] = extracted_data
    if error_message is not None:
        payload["errorMessage"] = error_message

    logger.info(
        "Reporting processing result",
        extra={"document_id": document_id, "status": status},
    )

    with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
        response = client.patch(
            url,
            json=payload,
            headers={"X-Internal-Secret": settings.internal_api_secret},
        )
        response.raise_for_status()
