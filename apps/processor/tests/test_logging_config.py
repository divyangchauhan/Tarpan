import json
import logging

from src.logging_config import JsonFormatter


def test_json_formatter_includes_message_and_extra_fields() -> None:
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=10,
        msg="Processed document",
        args=(),
        exc_info=None,
    )
    record.document_id = "doc-123"  # type: ignore[attr-defined]

    result = json.loads(JsonFormatter().format(record))

    assert result["level"] == "INFO"
    assert result["logger"] == "test"
    assert result["message"] == "Processed document"
    assert result["document_id"] == "doc-123"
