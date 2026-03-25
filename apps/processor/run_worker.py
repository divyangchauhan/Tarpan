"""
Local SQS worker — polls LocalStack and invokes the Lambda handler.

Usage:
    poetry run python run_worker.py

Mimics the SQS → Lambda trigger that CDK wires up in production.
Press Ctrl+C to stop.
"""

import json
import logging
import time
from typing import Any

import boto3

from src.config import settings
from src.handler import handler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("worker")

_QUEUE_URL = settings.sqs_document_processing_queue_url
_POLL_INTERVAL = 2  # seconds between empty-queue polls
_MAX_MESSAGES = 10
_VISIBILITY_TIMEOUT = 60  # seconds — how long the message is hidden during processing


def _get_sqs_client() -> Any:
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    return boto3.client("sqs", **kwargs)


def _process_message(sqs: Any, message: dict[str, Any]) -> None:
    receipt_handle: str = message["ReceiptHandle"]
    message_id: str = message["MessageId"]

    try:
        event = {"Records": [{"messageId": message_id, "body": message["Body"]}]}
        handler(event, object())
    except Exception:
        logger.exception(
            "Message processing failed",
            extra={"message_id": message_id},
        )
    finally:
        # Always delete in local dev — avoids infinite retry loops when the
        # NestJS API is not running (api_client errors are expected locally).
        sqs.delete_message(QueueUrl=_QUEUE_URL, ReceiptHandle=receipt_handle)
        logger.info("Message deleted from queue", extra={"message_id": message_id})


def run() -> None:
    sqs = _get_sqs_client()
    logger.info("Worker started, polling queue: %s", _QUEUE_URL)

    while True:
        response: dict[str, Any] = sqs.receive_message(
            QueueUrl=_QUEUE_URL,
            MaxNumberOfMessages=_MAX_MESSAGES,
            WaitTimeSeconds=10,  # long polling — reduces empty responses
            VisibilityTimeout=_VISIBILITY_TIMEOUT,
        )
        messages: list[dict[str, Any]] = response.get("Messages", [])

        if not messages:
            logger.debug("No messages, polling again in %ds", _POLL_INTERVAL)
            time.sleep(_POLL_INTERVAL)
            continue

        for message in messages:
            _process_message(sqs, message)


if __name__ == "__main__":
    run()
