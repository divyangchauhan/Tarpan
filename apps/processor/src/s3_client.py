"""S3 download and upload helpers."""

import logging
from typing import Any

import boto3
from botocore.config import Config

from src.config import settings

logger = logging.getLogger(__name__)


def _get_client() -> Any:
    kwargs: dict[str, Any] = {
        "region_name": settings.aws_region,
        "config": Config(signature_version="s3v4"),
    }
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    return boto3.client("s3", **kwargs)


def download_object(bucket: str, key: str) -> bytes:
    """Download an object from S3 and return its raw bytes."""
    client = _get_client()
    logger.info("Downloading S3 object", extra={"bucket": bucket, "key": key})
    response: dict[str, Any] = client.get_object(Bucket=bucket, Key=key)
    data: bytes = response["Body"].read()
    return data


def upload_object(bucket: str, key: str, data: bytes, content_type: str) -> None:
    """Upload bytes to an S3 object."""
    client = _get_client()
    logger.info("Uploading S3 object", extra={"bucket": bucket, "key": key})
    client.put_object(Bucket=bucket, Key=key, Body=data, ContentType=content_type)


def delete_object(bucket: str, key: str) -> None:
    """Delete one object after a generation callback cannot be delivered."""
    client = _get_client()
    client.delete_object(Bucket=bucket, Key=key)
