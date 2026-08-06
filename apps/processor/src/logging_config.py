"""JSON logging configuration shared by Lambda and the local worker."""

import json
import logging
import os
from datetime import UTC, datetime
from typing import Any


class JsonFormatter(logging.Formatter):
    """Format standard-library log records as one JSON object per line."""

    # Keep the standard record fields out of the structured context.  The
    # logger name must be a string here so this module also passes mypy.
    _STANDARD_FIELDS = set(logging.LogRecord("root", 0, "", 0, "", (), None).__dict__)

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "timestamp": datetime.fromtimestamp(record.created, tz=UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)

        for key, value in record.__dict__.items():
            if key not in self._STANDARD_FIELDS:
                entry[key] = value

        return json.dumps(entry, default=str)


def configure_logging() -> None:
    """Configure the process root logger for Lambda and local execution."""
    root = logging.getLogger()
    if not root.handlers:
        root.addHandler(logging.StreamHandler())

    formatter = JsonFormatter()
    for handler in root.handlers:
        handler.setFormatter(formatter)

    root.setLevel(os.environ.get("LOG_LEVEL", "INFO").upper())
