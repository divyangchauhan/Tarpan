"""Tests for S3 download/upload helpers."""

import os

import boto3
import pytest
from moto import mock_aws

from src.s3_client import download_object, upload_object

_BUCKET = "test-bucket"
_KEY = "cases/doc-123/certificate.pdf"
_DATA = b"fake-pdf-content"


@pytest.fixture(autouse=True)
def aws_credentials() -> None:
    """Ensure moto intercepts all AWS calls."""
    os.environ["AWS_ACCESS_KEY_ID"] = "testing"
    os.environ["AWS_SECRET_ACCESS_KEY"] = "testing"
    os.environ["AWS_SECURITY_TOKEN"] = "testing"
    os.environ["AWS_SESSION_TOKEN"] = "testing"
    os.environ["AWS_DEFAULT_REGION"] = "us-east-1"


@mock_aws
class TestS3Client:
    def _create_bucket(self) -> None:
        boto3.client("s3", region_name="us-east-1").create_bucket(Bucket=_BUCKET)

    def test_upload_and_download_roundtrip(self) -> None:
        self._create_bucket()
        upload_object(_BUCKET, _KEY, _DATA, "application/pdf")
        result = download_object(_BUCKET, _KEY)
        assert result == _DATA

    def test_upload_sets_content_type(self) -> None:
        self._create_bucket()
        upload_object(_BUCKET, _KEY, _DATA, "application/pdf")
        s3 = boto3.client("s3", region_name="us-east-1")
        head = s3.head_object(Bucket=_BUCKET, Key=_KEY)
        assert head["ContentType"] == "application/pdf"

    def test_download_missing_key_raises(self) -> None:
        self._create_bucket()
        with pytest.raises(Exception):
            download_object(_BUCKET, "nonexistent/key.pdf")
