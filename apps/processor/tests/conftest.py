"""Shared test fixtures and environment setup."""

import os

import pytest


def pytest_configure(config: pytest.Config) -> None:
    """Set required env vars before any module is imported during collection."""
    os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")
    os.environ.setdefault("API_CALLBACK_URL", "http://localhost:3001")
    os.environ.setdefault("INTERNAL_API_SECRET", "test-secret")
    os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
    os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
    os.environ.setdefault("AWS_DEFAULT_REGION", "us-east-1")
