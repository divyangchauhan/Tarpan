"""Basic smoke tests for the Lambda handler routing logic."""
import json
from unittest.mock import patch

from src.handler import handler


def _make_sqs_event(body: dict) -> dict:
    return {
        "Records": [
            {
                "messageId": "test-message-id",
                "body": json.dumps(body),
            }
        ]
    }


class TestHandler:
    def test_direct_invocation_routes_to_generation(self) -> None:
        event = {"generatedDocumentId": "gen-123"}
        result = handler(event, object())
        assert result["generatedDocumentId"] == "gen-123"
        assert result["status"] == "stub"

    def test_sqs_invocation_routes_to_processing(self) -> None:
        event = _make_sqs_event({"documentId": "doc-123", "s3Key": "uploads/doc-123.pdf"})
        result = handler(event, object())
        assert result["batchItemFailures"] == []
        assert result["results"][0]["documentId"] == "doc-123"
