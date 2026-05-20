"""Tests for Sentry initialisation in the Lambda handler."""

import importlib
from unittest.mock import MagicMock, patch


def test_sentry_init_called_when_dsn_is_set() -> None:
    """sentry_sdk.init is called when SENTRY_DSN is configured."""
    mock_init = MagicMock()
    mock_settings = MagicMock()
    mock_settings.sentry_dsn = "https://public@sentry.example.com/1"
    mock_settings.sentry_environment = "production"

    import src.handler as handler_module  # ensure module is already cached

    # Patch src.config.settings so the reload picks it up via `from src.config import settings`
    with (
        patch("sentry_sdk.init", mock_init),
        patch("src.config.settings", mock_settings),
    ):
        importlib.reload(handler_module)

        mock_init.assert_called_once()
        call_kwargs = mock_init.call_args.kwargs
        assert call_kwargs["dsn"] == "https://public@sentry.example.com/1"
        assert call_kwargs["environment"] == "production"
        assert call_kwargs["traces_sample_rate"] == 0.1
        assert call_kwargs["send_default_pii"] is False


def test_sentry_init_skipped_when_dsn_is_absent() -> None:
    """sentry_sdk.init is NOT called when SENTRY_DSN is None."""
    mock_init = MagicMock()
    mock_settings = MagicMock()
    mock_settings.sentry_dsn = None

    import src.handler as handler_module  # ensure module is already cached

    with (
        patch("sentry_sdk.init", mock_init),
        patch("src.config.settings", mock_settings),
    ):
        importlib.reload(handler_module)

        mock_init.assert_not_called()
