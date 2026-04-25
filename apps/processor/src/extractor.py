"""Claude API integration — extracts structured data from death certificate content."""

import logging
from typing import Any

from anthropic import Anthropic

from src.config import settings
from src.models import ExtractedCertificateData

logger = logging.getLogger(__name__)

_MODEL = "claude-opus-4-6"

_SYSTEM_PROMPT = """\
You are an expert at reading official US death certificates.
Extract the requested information accurately using the provided tool.
Use ISO 8601 format (YYYY-MM-DD) for all dates.
If a field is not present or not clearly legible, omit it rather than guessing.
Do not include cause of death, manner of death, or any medical information.\
"""

_EXTRACTION_TOOL: dict[str, Any] = {
    "name": "extract_death_certificate_data",
    "description": "Extract structured fields from a US death certificate.",
    "input_schema": {
        "type": "object",
        "properties": {
            "full_name": {
                "type": "string",
                "description": "Full legal name of the deceased",
            },
            "first_name": {"type": "string", "description": "First/given name"},
            "middle_name": {"type": "string", "description": "Middle name, if present"},
            "last_name": {"type": "string", "description": "Last/family name"},
            "date_of_birth": {
                "type": "string",
                "description": (
                    "Date of birth in YYYY-MM-DD format, if present. "
                    "Cross-check: the birth year must be earlier than the death year, "
                    "and the resulting age must match the age field on the certificate "
                    "(within 1 year). If the digits are ambiguous, use the age and "
                    "date of death to resolve them."
                ),
            },
            "date_of_death": {
                "type": "string",
                "description": "Date of death in YYYY-MM-DD format",
            },
            "place_of_death": {
                "type": "string",
                "description": "City, county, and/or state of death",
            },
            "state": {
                "type": "string",
                "description": "Two-letter US state abbreviation that issued the certificate",
            },
            "certificate_number": {
                "type": "string",
                "description": (
                    "The state-level certificate or file number. "
                    "Look for fields labelled 'STATE FILE NO.', 'STATE CERTIFICATE NO.', "
                    "'CERTIFICATE OF DEATH NO.', or 'REGISTRATION NO.'. "
                    "If both a state file number and a local file number are present, "
                    "prefer the state file number."
                ),
            },
            "certifier_name": {
                "type": "string",
                "description": "Name of certifying physician or official",
            },
            "certifier_title": {
                "type": "string",
                "description": "Title of certifying official (e.g. Medical Examiner)",
            },
            "social_security_number": {
                "type": "string",
                "description": (
                    "Social Security Number as it appears on the certificate. "
                    "Preserve the exact format — full (e.g. '123-45-6789') or "
                    "redacted (e.g. 'XXX-XX-6789', '***-**-6789', or '000-00-6789'). "
                    "Do not reformat or normalize the value."
                ),
            },
        },
        "required": ["full_name", "last_name", "date_of_death", "place_of_death"],
    },
}


def extract_certificate_data(
    content: list[dict[str, Any]],
) -> ExtractedCertificateData:
    """
    Send document content to Claude and return validated extracted data.

    `content` is a list of Claude API message content blocks — either text or
    image blocks as produced by pdf_processor.prepare_content_for_claude().
    """
    client = Anthropic(api_key=settings.anthropic_api_key)

    user_content: list[dict[str, Any]] = [
        *content,
        {
            "type": "text",
            "text": "Extract all available information from this death certificate.",
        },
    ]

    logger.info("Calling Claude API for extraction", extra={"block_count": len(content)})

    response = client.messages.create(  # type: ignore[call-overload]
        model=_MODEL,
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        tools=[_EXTRACTION_TOOL],
        tool_choice={"type": "tool", "name": "extract_death_certificate_data"},
        messages=[{"role": "user", "content": user_content}],
    )

    tool_use = next(block for block in response.content if block.type == "tool_use")
    extracted = ExtractedCertificateData.model_validate(tool_use.input)

    logger.info("Extraction complete")
    return extracted
