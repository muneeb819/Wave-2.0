"""Offline tests for backend error tracking and telemetry counters."""

from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from backend import observability
from backend.main import app


@pytest.fixture(autouse=True)
def clean_telemetry(monkeypatch):
    monkeypatch.setenv("SENTRY_DSN", "")
    observability.counters.reset()
    observability.configure_error_tracking("2.0.0", dsn="")


def test_sentry_disabled_by_default_and_enabled_with_dsn(monkeypatch):
    assert observability.error_tracking_enabled() is False

    with patch("backend.observability.sentry_sdk.init") as mock_init:
        monkeypatch.setenv("SENTRY_TRACES_SAMPLE_RATE", "0.25")
        enabled = observability.configure_error_tracking(
            "2.0.0", dsn="https://public@o0.ingest.sentry.io/1"
        )
        assert enabled is True
        assert observability.error_tracking_enabled() is True
        mock_init.assert_called_once_with(
            dsn="https://public@o0.ingest.sentry.io/1",
            release="wave-2-studio@2.0.0",
            send_default_pii=False,
            traces_sample_rate=0.25,
        )


def test_health_exposes_telemetry_counters_and_error_tracking_flag():
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000)) as client:
        first = client.get("/api/health").json()
        assert first["error_tracking"] is False
        assert "requests_total" in first["metrics"]
        second = client.get("/api/health").json()
        assert second["metrics"]["requests_total"] >= first["metrics"]["requests_total"] + 1


@pytest.mark.asyncio
async def test_unhandled_exception_handler_masks_traceback_and_captures_sentry():
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/boom",
        "headers": [],
        "query_string": b"",
    }
    request = Request(scope)
    with patch("backend.observability.sentry_sdk.capture_exception") as mock_capture:
        response = await observability.unhandled_exception_handler(
            request, RuntimeError("internal secret path /srv/keys")
        )
    assert response.status_code == 500
    assert b"internal_error" in response.body
    assert b"/srv/keys" not in response.body
    assert observability.counters.errors_total == 1
    mock_capture.assert_called_once()
