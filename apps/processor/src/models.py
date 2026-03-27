"""Pydantic models for document processing."""

from pydantic import BaseModel, Field


class ExtractedCertificateData(BaseModel):
    """Structured data extracted from a death certificate by Claude Vision."""

    full_name: str = Field(description="Full legal name of the deceased")
    first_name: str | None = Field(None, description="First/given name")
    middle_name: str | None = Field(None, description="Middle name, if present")
    last_name: str | None = Field(None, description="Last/family name")
    date_of_birth: str | None = Field(None, description="Date of birth (YYYY-MM-DD)")
    date_of_death: str = Field(description="Date of death (YYYY-MM-DD)")
    place_of_death: str = Field(description="City, county, and/or state of death")
    state: str | None = Field(None, description="US state abbreviation that issued the certificate")
    certificate_number: str | None = Field(None, description="Certificate registration number")
    certifier_name: str | None = Field(None, description="Name of certifying physician or official")
    certifier_title: str | None = Field(None, description="Title of certifying official")


class GenerationRequest(BaseModel):
    """Payload for a direct Lambda invocation requesting PDF generation."""

    generated_document_id: str = Field(description="ID of the GeneratedDocument record in the API")
    template_id: str = Field(description="Template slug, e.g. 'ssa-721' or 'bank-closure'")
    case_id: str = Field(description="Case ID used for S3 key namespacing")
    deceased: ExtractedCertificateData = Field(description="Extracted death certificate data")

    # Executor / next-of-kin information
    executor_name: str = Field(description="Full name of the person sending the letter")
    executor_address: str = Field(description="Mailing address of the executor (multi-line ok)")
    executor_relationship: str = Field(
        description="Relationship to the deceased, e.g. 'Son', 'Spouse'"
    )
    executor_phone: str | None = Field(None, description="Contact phone number")
    executor_email: str | None = Field(None, description="Contact email address")

    # Institution overrides (used by generic templates)
    institution_name: str | None = Field(
        None, description="Name of the receiving institution (overrides template default)"
    )
    institution_address: str | None = Field(
        None, description="Mailing address of the institution (overrides template default)"
    )
