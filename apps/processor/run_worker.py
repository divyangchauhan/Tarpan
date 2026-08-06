"""
Local SQS worker — polls both processing and generation queues, then invokes the Lambda handler.

Usage:
    poetry run python run_worker.py

Mimics the SQS → Lambda trigger that CDK wires up in production.
Press Ctrl+C to stop.
"""

import logging
import time
from typing import Any

import boto3

from src.config import settings
from src.handler import handler
from src.logging_config import configure_logging

configure_logging()
logger = logging.getLogger("worker")

_QUEUES = [
    settings.sqs_document_processing_queue_url,
    settings.sqs_document_generation_queue_url,
]
_POLL_INTERVAL = 2  # seconds between empty-queue polls
_MAX_MESSAGES = 10
_VISIBILITY_TIMEOUT = 120  # seconds — allow time for Claude API calls + PDF rendering
_WAIT_TIME_SECONDS = 5  # long-poll wait per queue (2 queues × 5s ≈ 10s per cycle)


def _get_sqs_client() -> Any:
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
    return boto3.client("sqs", **kwargs)


def _process_message(sqs: Any, queue_url: str, message: dict[str, Any]) -> None:
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
        sqs.delete_message(QueueUrl=queue_url, ReceiptHandle=receipt_handle)
        logger.info("Message deleted from queue", extra={"message_id": message_id})


def run() -> None:
    sqs = _get_sqs_client()
    logger.info("Worker started, polling queues: %s", _QUEUES)

    while True:
        got_any = False

        for queue_url in _QUEUES:
            response: dict[str, Any] = sqs.receive_message(
                QueueUrl=queue_url,
                MaxNumberOfMessages=_MAX_MESSAGES,
                WaitTimeSeconds=_WAIT_TIME_SECONDS,
                VisibilityTimeout=_VISIBILITY_TIMEOUT,
            )
            messages: list[dict[str, Any]] = response.get("Messages", [])

            for message in messages:
                _process_message(sqs, queue_url, message)
                got_any = True

        if not got_any:
            logger.debug("No messages on any queue, sleeping %ds", _POLL_INTERVAL)
            time.sleep(_POLL_INTERVAL)


if __name__ == "__main__":
    run()
