"""Tests for the Jinja2 → WeasyPrint PDF template engine."""

from unittest.mock import MagicMock, patch

import pytest

from src.models import ExtractedCertificateData, GenerationRequest
from src.template_engine import TEMPLATE_REGISTRY, render


@pytest.fixture()
def deceased() -> ExtractedCertificateData:
    return ExtractedCertificateData(
        full_name="Jane A. Smith",
        first_name="Jane",
        middle_name="A.",
        last_name="Smith",
        date_of_birth="1945-03-15",
        date_of_death="2024-11-20",
        place_of_death="Springfield, IL",
        state="IL",
        certificate_number="2024-IL-001234",
        certifier_name="Dr. John Doe",
        certifier_title="Attending Physician",
    )


def _make_request(
    deceased: ExtractedCertificateData,
    template_id: str,
    **kwargs: object,
) -> GenerationRequest:
    return GenerationRequest(
        generated_document_id="gen-abc-123",
        template_id=template_id,
        case_id="case-xyz-456",
        deceased=deceased,
        executor_name="Robert Smith",
        executor_address="456 Elm Street\nSpringfield, IL 62701",
        executor_relationship="Son",
        executor_phone="(217) 555-0100",
        executor_email="robert.smith@example.com",
        **kwargs,
    )


class TestTemplateRegistry:
    def test_all_expected_templates_registered(self) -> None:
        expected = {
            "ssa-721",
            "medicare",
            "bank-closure",
            "credit-card-cancellation",
            "subscription-cancellation",
            "irs-notification",
            "dmv-notification",
            "voter-registration",
            "usps-notification",
            "life-insurance",
            "pension-401k",
            "veterans-affairs",
            "passport-cancellation",
            "professional-license",
            "employer-notification",
        }
        assert expected == set(TEMPLATE_REGISTRY.keys())

    def test_registry_has_15_entries(self) -> None:
        assert len(TEMPLATE_REGISTRY) == 15


class TestRenderUnknownTemplate:
    def test_unknown_template_raises_value_error(self, deceased: ExtractedCertificateData) -> None:
        request = _make_request(deceased, "nonexistent-template")
        with pytest.raises(ValueError, match="Unknown template_id"):
            render(request)


class TestRenderAllTemplates:
    """For each registered template: verify render() returns non-empty bytes.

    WeasyPrint is mocked so tests run fast in CI without a full PDF stack.
    """

    def _run_render(self, template_id: str, deceased: ExtractedCertificateData) -> bytes:
        fake_pdf = b"%PDF-1.4 fake"
        request = _make_request(
            deceased,
            template_id,
            institution_name="Test Institution",
            institution_address="100 Institution Blvd\nWashington, DC 20001",
        )
        mock_html_instance = MagicMock()
        mock_html_instance.write_pdf.return_value = fake_pdf

        with patch("src.template_engine.HTML", return_value=mock_html_instance) as mock_html:
            result = render(request)
            mock_html.assert_called_once()
            mock_html_instance.write_pdf.assert_called_once()

        assert result == fake_pdf
        assert len(result) > 0
        return result

    @pytest.mark.parametrize("template_id", list(TEMPLATE_REGISTRY.keys()))
    def test_render_returns_bytes(
        self, template_id: str, deceased: ExtractedCertificateData
    ) -> None:
        self._run_render(template_id, deceased)


class TestRenderContext:
    """Verify that key template context values appear in rendered HTML."""

    def test_deceased_name_in_html(self, deceased: ExtractedCertificateData) -> None:
        request = _make_request(deceased, "ssa-721")
        fake_pdf = b"%PDF-1.4 fake"
        captured_html: list[str] = []

        def capture_html(string: str, base_url: str) -> MagicMock:
            captured_html.append(string)
            mock = MagicMock()
            mock.write_pdf.return_value = fake_pdf
            return mock

        with patch("src.template_engine.HTML", side_effect=capture_html):
            render(request)

        assert len(captured_html) == 1
        html = captured_html[0]
        assert "Jane A. Smith" in html
        assert "Robert Smith" in html
        assert "2024-11-20" in html

    def test_executor_phone_optional(self, deceased: ExtractedCertificateData) -> None:
        request = GenerationRequest(
            generated_document_id="gen-no-phone",
            template_id="medicare",
            case_id="case-no-phone",
            deceased=deceased,
            executor_name="Alice Jones",
            executor_address="789 Oak Ave\nChicago, IL 60601",
            executor_relationship="Daughter",
        )
        fake_pdf = b"%PDF-1.4 fake"
        mock_instance = MagicMock()
        mock_instance.write_pdf.return_value = fake_pdf

        with patch("src.template_engine.HTML", return_value=mock_instance):
            result = render(request)

        assert result == fake_pdf

    def test_institution_override_rendered(self, deceased: ExtractedCertificateData) -> None:
        request = _make_request(
            deceased,
            "bank-closure",
            institution_name="First National Bank",
            institution_address="1 Bank Plaza\nNew York, NY 10001",
        )
        fake_pdf = b"%PDF-1.4 fake"
        captured_html: list[str] = []

        def capture_html(string: str, base_url: str) -> MagicMock:
            captured_html.append(string)
            mock = MagicMock()
            mock.write_pdf.return_value = fake_pdf
            return mock

        with patch("src.template_engine.HTML", side_effect=capture_html):
            render(request)

        html = captured_html[0]
        assert "First National Bank" in html


class TestHandlerGenerationIntegration:
    """Integration-level tests for _handle_generation in handler.py."""

    def _make_event(self, template_id: str = "ssa-721") -> dict[str, object]:
        return {
            "generatedDocumentId": "gen-handler-001",
            "templateId": template_id,
            "caseId": "case-handler-001",
            "deceased": {
                "full_name": "Jane A. Smith",
                "first_name": "Jane",
                "last_name": "Smith",
                "date_of_birth": "1945-03-15",
                "date_of_death": "2024-11-20",
                "place_of_death": "Springfield, IL",
                "state": "IL",
                "certificate_number": "2024-IL-001234",
                "certifier_name": "Dr. John Doe",
                "certifier_title": "Attending Physician",
            },
            "executorName": "Robert Smith",
            "executorAddress": "456 Elm Street\nSpringfield, IL 62701",
            "executorRelationship": "Son",
            "executorPhone": "(217) 555-0100",
            "executorEmail": "robert.smith@example.com",
        }

    def test_successful_generation(self) -> None:
        from src.handler import _handle_generation

        fake_pdf = b"%PDF-1.4 fake"
        mock_html_instance = MagicMock()
        mock_html_instance.write_pdf.return_value = fake_pdf

        with (
            patch("src.template_engine.HTML", return_value=mock_html_instance),
            patch("src.handler.s3_client.upload_object") as mock_upload,
            patch("src.handler.api_client.report_generation_success") as mock_report,
        ):
            result = _handle_generation(self._make_event())

        assert result["status"] == "COMPLETED"
        assert result["generatedDocumentId"] == "gen-handler-001"
        assert "s3Key" in result
        mock_upload.assert_called_once()
        mock_report.assert_called_once()

    def test_generation_failure_reports_to_api(self) -> None:
        from src.handler import _handle_generation

        with (
            patch("src.template_engine.HTML", side_effect=RuntimeError("WeasyPrint exploded")),
            patch("src.handler.api_client.report_generation_failure") as mock_fail,
        ):
            result = _handle_generation(self._make_event())

        assert result["status"] == "FAILED"
        mock_fail.assert_called_once_with("gen-handler-001", "Generation failed: RuntimeError")

    def test_s3_key_contains_template_and_case_ids(self) -> None:
        from src.handler import _handle_generation

        fake_pdf = b"%PDF-1.4 fake"
        mock_html_instance = MagicMock()
        mock_html_instance.write_pdf.return_value = fake_pdf
        captured_keys: list[str] = []

        def capture_upload(bucket: str, key: str, data: bytes, content_type: str) -> None:
            captured_keys.append(key)

        with (
            patch("src.template_engine.HTML", return_value=mock_html_instance),
            patch("src.handler.s3_client.upload_object", side_effect=capture_upload),
            patch("src.handler.api_client.report_generation_success"),
        ):
            _handle_generation(self._make_event())

        assert len(captured_keys) == 1
        key = captured_keys[0]
        assert "case-handler-001" in key
        assert "ssa-721" in key
        assert "gen-handler-001" in key
        assert key.endswith(".pdf")
