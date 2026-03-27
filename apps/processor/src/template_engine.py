"""
Template engine: Jinja2 → HTML → PDF (WeasyPrint).

Usage:
    pdf_bytes = render(generation_request)
"""

import logging
from datetime import date
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

from src.models import GenerationRequest

logger = logging.getLogger(__name__)

_TEMPLATES_DIR = Path(__file__).parent / "templates"

_JINJA_ENV = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
    trim_blocks=True,
    lstrip_blocks=True,
)

# Maps template_id → template filename (without the templates/ prefix)
TEMPLATE_REGISTRY: dict[str, str] = {
    "ssa-721": "ssa_721.html",
    "medicare": "medicare.html",
    "bank-closure": "bank_closure.html",
    "credit-card-cancellation": "credit_card_cancellation.html",
    "subscription-cancellation": "subscription_cancellation.html",
    "irs-notification": "irs_notification.html",
    "dmv-notification": "dmv_notification.html",
    "voter-registration": "voter_registration.html",
    "usps-notification": "usps_notification.html",
    "life-insurance": "life_insurance.html",
    "pension-401k": "pension_401k.html",
    "veterans-affairs": "veterans_affairs.html",
    "passport-cancellation": "passport_cancellation.html",
    "professional-license": "professional_license.html",
    "employer-notification": "employer_notification.html",
}


def render(request: GenerationRequest) -> bytes:
    """Render a legal letter template to PDF bytes.

    Args:
        request: Validated generation request with deceased data and executor info.

    Returns:
        PDF bytes ready to upload to S3.

    Raises:
        ValueError: If template_id is not registered.
        jinja2.TemplateNotFound: If the template file is missing on disk.
    """
    template_file = TEMPLATE_REGISTRY.get(request.template_id)
    if template_file is None:
        raise ValueError(
            f"Unknown template_id '{request.template_id}'. "
            f"Valid options: {sorted(TEMPLATE_REGISTRY)}"
        )

    logger.info(
        "Rendering template",
        extra={
            "template_id": request.template_id,
            "generated_document_id": request.generated_document_id,
        },
    )

    template = _JINJA_ENV.get_template(template_file)
    context = _build_context(request)
    html_str = template.render(**context)

    pdf_bytes: bytes = HTML(string=html_str, base_url=str(_TEMPLATES_DIR)).write_pdf()

    logger.info(
        "Template rendered to PDF",
        extra={
            "template_id": request.template_id,
            "generated_document_id": request.generated_document_id,
            "pdf_size_bytes": len(pdf_bytes),
        },
    )
    return pdf_bytes


def _build_context(request: GenerationRequest) -> dict[str, object]:
    """Build the Jinja2 template context from a GenerationRequest."""
    today = date.today().strftime("%B %d, %Y")

    # Split multi-line address into list for template iteration
    address_lines = [ln.strip() for ln in request.executor_address.splitlines() if ln.strip()]

    return {
        "deceased": request.deceased,
        "executor_name": request.executor_name,
        "executor_address_lines": address_lines,
        "executor_relationship": request.executor_relationship,
        "executor_phone": request.executor_phone,
        "executor_email": request.executor_email,
        "institution_name": request.institution_name,
        "institution_address": request.institution_address,
        "letter_date": today,
        "generated_document_id": request.generated_document_id,
        "case_id": request.case_id,
    }
