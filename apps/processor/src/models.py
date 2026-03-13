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
