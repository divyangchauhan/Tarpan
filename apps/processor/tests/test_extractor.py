"""Tests for Claude API extraction."""

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.extractor import extract_certificate_data
from src.models import ExtractedCertificateData

_VALID_TOOL_INPUT: dict[str, Any] = {
    "full_name": "Robert James Smith",
    "first_name": "Robert",
    "middle_name": "James",
    "last_name": "Smith",
    "date_of_birth": "1945-06-15",
    "date_of_death": "2026-02-28",
    "place_of_death": "Chicago, IL",
    "state": "IL",
    "certificate_number": "IL-2026-00482",
    "certifier_name": "Dr. Emily Chen",
    "certifier_title": "Medical Examiner",
    "social_security_number": "123-45-6789",
}

_TEXT_CONTENT: list[dict[str, Any]] = [
    {"type": "text", "text": "STATE OF ILLINOIS — CERTIFICATE OF DEATH ..."}
]


def _make_mock_response(tool_input: dict[str, Any]) -> MagicMock:
    tool_use_block = MagicMock()
    tool_use_block.type = "tool_use"
    tool_use_block.input = tool_input

    response = MagicMock()
    response.content = [tool_use_block]
    return response


class TestExtractCertificateData:
    def test_returns_validated_model(self) -> None:
        mock_response = _make_mock_response(_VALID_TOOL_INPUT)

        with patch("src.extractor.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_anthropic_cls.return_value = mock_client

            result = extract_certificate_data(_TEXT_CONTENT)

        assert isinstance(result, ExtractedCertificateData)
        assert result.full_name == "Robert James Smith"
        assert result.date_of_death == "2026-02-28"
        assert result.place_of_death == "Chicago, IL"
        assert result.social_security_number == "123-45-6789"

    def test_ssn_redacted_format_preserved(self) -> None:
        redacted_input: dict[str, Any] = {
            **_VALID_TOOL_INPUT,
            "social_security_number": "XXX-XX-6789",
        }
        mock_response = _make_mock_response(redacted_input)

        with patch("src.extractor.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_anthropic_cls.return_value = mock_client

            result = extract_certificate_data(_TEXT_CONTENT)

        assert result.social_security_number == "XXX-XX-6789"

    def test_ssn_absent_is_none(self) -> None:
        no_ssn_input: dict[str, Any] = {k: v for k, v in _VALID_TOOL_INPUT.items() if k != "social_security_number"}
        mock_response = _make_mock_response(no_ssn_input)

        with patch("src.extractor.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_anthropic_cls.return_value = mock_client

            result = extract_certificate_data(_TEXT_CONTENT)

        assert result.social_security_number is None

    def test_optional_fields_are_none_when_absent(self) -> None:
        minimal_input: dict[str, Any] = {
            "full_name": "Jane Doe",
            "last_name": "Doe",
            "date_of_death": "2026-01-01",
            "place_of_death": "Austin, TX",
        }
        mock_response = _make_mock_response(minimal_input)

        with patch("src.extractor.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_anthropic_cls.return_value = mock_client

            result = extract_certificate_data(_TEXT_CONTENT)

        assert result.first_name is None
        assert result.middle_name is None
        assert result.certificate_number is None
        assert result.social_security_number is None

    def test_passes_image_content_to_claude(self) -> None:
        image_content: list[dict[str, Any]] = [
            {
                "type": "image",
                "source": {"type": "base64", "media_type": "image/png", "data": "abc123"},
            }
        ]
        mock_response = _make_mock_response(_VALID_TOOL_INPUT)

        with patch("src.extractor.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_anthropic_cls.return_value = mock_client

            extract_certificate_data(image_content)

            call_kwargs = mock_client.messages.create.call_args[1]
            user_message = call_kwargs["messages"][0]
            assert user_message["role"] == "user"
            # Image block should be in the content
            content_types = [b["type"] for b in user_message["content"]]
            assert "image" in content_types

    def test_missing_required_field_raises_validation_error(self) -> None:
        bad_input: dict[str, Any] = {
            "full_name": "Jane Doe",
            # missing last_name, date_of_death, place_of_death
        }
        mock_response = _make_mock_response(bad_input)

        with patch("src.extractor.Anthropic") as mock_anthropic_cls:
            mock_client = MagicMock()
            mock_client.messages.create.return_value = mock_response
            mock_anthropic_cls.return_value = mock_client

            with pytest.raises(ValueError):
                extract_certificate_data(_TEXT_CONTENT)
