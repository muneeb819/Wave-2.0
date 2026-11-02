"""Optional Sentry error tracking and operational telemetry counters for FastAPI."""

from __future__ import annotations

import os
from dataclasses import dataclass

import sentry_sdk
import structlog
from fastapi import Request
from fastapi.responses import JSONResponse

logger = structlog.get_logger("inference-studio.observability")


@dataclass
class TelemetryCounters:
    requests_total: int = 0
    errors_total: int = 0
    sessions_minted_total: int = 0

    def reset(self) -> None:
        self.requests_total = 0
        self.errors_total = 0
        self.sessions_minted_total = 0

    def snapshot(self) -> dict[str, int]:
        return {
            "requests_total": self.requests_total,
            "errors_total": self.errors_total,
            "sessions_minted_total": self.sessions_minted_total,
        }


counters = TelemetryCounters()
_sentry_initialized = False


def configure_error_tracking(version: str, dsn: str | None = None) -> bool:
    """Initialize Sentry SDK when SENTRY_DSN is configured; no-op otherwise."""
    global _sentry_initialized
    effective_dsn = (dsn if dsn is not None else os.environ.get("SENTRY_DSN", "")).strip()
    if not effective_dsn:
        _sentry_initialized = False
        return False
    raw_rate = os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1").strip()
    try:
        sample_rate = max(0.0, min(1.0, float(raw_rate)))
    except ValueError:
        sample_rate = 0.1
    sentry_sdk.init(
        dsn=effective_dsn,
        release=f"wave-2-studio@{version}",
        send_default_pii=False,
        traces_sample_rate=sample_rate,
    )
    _sentry_initialized = True
    logger.info("error_tracking_initialized", provider="sentry", traces_sample_rate=sample_rate)
    return True


def error_tracking_enabled() -> bool:
    return _sentry_initialized or bool(os.environ.get("SENTRY_DSN", "").strip())


def record_request(status_code: int) -> None:
    counters.requests_total += 1
    if status_code >= 500:
        counters.errors_total += 1


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Capture unexpected exceptions without leaking internal stack traces to callers."""
    counters.errors_total += 1
    sentry_sdk.capture_exception(exc)
    ctx_vars = structlog.contextvars.get_contextvars()
    request_id = str(ctx_vars.get("request_id", ""))
    logger.error(
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        error_type=type(exc).__name__,
    )
    headers = {"X-Request-ID": request_id} if request_id else {}
    return JSONResponse(
        {
            "detail": {
                "code": "internal_error",
                "message": "An unexpected server error occurred.",
            }
        },
        status_code=500,
        headers=headers,
    )
