"""Tests for the API callback client."""

from typing import Any
from unittest.mock import MagicMock, patch

import httpx
import pytest

from src.api_client import report_failure, report_success

_DOC_ID = "d1e2f3a4-b5c6-7890-abcd-ef1234567890"
_EXTRACTED: dict[str, Any] = {
    "full_name": "Robert Smith",
    "date_of_death": "2026-02-28",
    "place_of_death": "Chicago, IL",
}


def _make_mock_client(status_code: int = 200) -> MagicMock:
    mock_response = MagicMock()
    mock_response.status_code = status_code
    mock_response.raise_for_status = MagicMock(
        side_effect=None
        if status_code < 400
        else httpx.HTTPStatusError(
            "error",
            request=MagicMock(),
            response=mock_response,
        )
    )
    mock_client_instance = MagicMock()
    mock_client_instance.__enter__ = MagicMock(return_value=mock_client_instance)
    mock_client_instance.__exit__ = MagicMock(return_value=False)
    mock_client_instance.patch.return_value = mock_response
    return mock_client_instance


class TestReportSuccess:
    def test_sends_patch_with_processed_status(self) -> None:
        mock_client = _make_mock_client()
        with patch("src.api_client.httpx.Client", return_value=mock_client):
            report_success(_DOC_ID, _EXTRACTED)

        call_kwargs = mock_client.patch.call_args[1]
        assert call_kwargs["json"]["status"] == "PROCESSED"
        assert call_kwargs["json"]["documentId"] == _DOC_ID
        assert call_kwargs["json"]["extractedData"] == _EXTRACTED

    def test_includes_internal_secret_header(self) -> None:
        mock_client = _make_mock_client()
        with patch("src.api_client.httpx.Client", return_value=mock_client):
            report_success(_DOC_ID, _EXTRACTED)

        headers = mock_client.patch.call_args[1]["headers"]
        assert "X-Internal-Secret" in headers


class TestReportFailure:
    def test_sends_patch_with_failed_status(self) -> None:
        mock_client = _make_mock_client()
        with patch("src.api_client.httpx.Client", return_value=mock_client):
            report_failure(_DOC_ID, "Processing failed: ValidationError")

        call_kwargs = mock_client.patch.call_args[1]
        assert call_kwargs["json"]["status"] == "FAILED"
        assert call_kwargs["json"]["errorMessage"] == "Processing failed: ValidationError"
        assert "extractedData" not in call_kwargs["json"]

    def test_raises_on_http_error(self) -> None:
        mock_client = _make_mock_client(status_code=500)
        with patch("src.api_client.httpx.Client", return_value=mock_client):
            with pytest.raises(httpx.HTTPStatusError):
                report_failure(_DOC_ID, "some error")
