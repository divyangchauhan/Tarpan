"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # AWS
    aws_region: str = "us-east-1"
    aws_endpoint_url: str | None = None  # Set for LocalStack in dev
    s3_uploads_bucket: str = "afterlight-uploads"
    s3_generated_docs_bucket: str = "afterlight-generated-docs"

    # Anthropic
    anthropic_api_key: str

    # SQS
    sqs_document_processing_queue_url: str = (
        "http://localhost:4566/000000000000/afterlight-document-processing"
    )
    sqs_document_generation_queue_url: str = (
        "http://localhost:4566/000000000000/afterlight-document-generation"
    )

    # API callback
    api_callback_url: str
    internal_api_secret: str

    # Processing thresholds
    extraction_confidence_threshold: float = 0.85


settings = Settings()  # type: ignore[call-arg]
