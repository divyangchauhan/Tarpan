"""Application configuration loaded from environment variables."""

import json
import logging
import os

import boto3
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


def _resolve_secret(env_var: str, arn_env_var: str) -> None:
    """If env_var is absent but arn_env_var is set, fetch the value from Secrets Manager."""
    if os.environ.get(env_var):
        return
    arn = os.environ.get(arn_env_var)
    if not arn:
        return
    try:
        client = boto3.client(
            "secretsmanager", region_name=os.environ.get("AWS_REGION", "us-east-1")
        )
        response = client.get_secret_value(SecretId=arn)
        secret = response.get("SecretString", "")
        # Support both plain strings and {"value": "..."} JSON objects
        try:
            parsed = json.loads(secret)
            os.environ[env_var] = parsed.get("value", secret)
        except (json.JSONDecodeError, AttributeError):
            os.environ[env_var] = secret
        logger.info("Resolved %s from Secrets Manager", env_var)
    except Exception:
        logger.exception("Failed to resolve %s from Secrets Manager ARN %s", env_var, arn)


# Fetch secrets from Secrets Manager before Pydantic Settings loads them.
# In Lambda, ANTHROPIC_API_KEY_SECRET_ARN and INTERNAL_API_SECRET_ARN are
# set as env vars by CDK; the actual values are never in the environment.
_resolve_secret("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY_SECRET_ARN")
_resolve_secret("INTERNAL_API_SECRET", "INTERNAL_API_SECRET_ARN")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # AWS
    aws_region: str = "us-east-1"
    aws_endpoint_url: str | None = None  # Set for LocalStack in dev
    s3_uploads_bucket: str = "tarpan-uploads"
    s3_generated_docs_bucket: str = "tarpan-generated-docs"

    # Anthropic
    anthropic_api_key: str

    # SQS
    sqs_document_processing_queue_url: str = (
        "http://localhost:4566/000000000000/tarpan-document-processing"
    )
    sqs_document_generation_queue_url: str = (
        "http://localhost:4566/000000000000/tarpan-document-generation"
    )

    # API callback
    api_callback_url: str
    generation_dlq_arn: str = ""
    internal_api_secret: str

    # Processing thresholds
    extraction_confidence_threshold: float = 0.85

    # Sentry (optional — omit or leave empty to disable error tracking)
    sentry_dsn: str | None = None
    sentry_environment: str = "production"


settings = Settings()  # type: ignore[call-arg]
