"""Wave 2.0 FastAPI control and room-scoped LiveKit token service."""

from __future__ import annotations

import logging
import os
import time
from datetime import timedelta
from urllib.parse import urlparse
from uuid import uuid4

import structlog
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from livekit import api
from pydantic import BaseModel, ConfigDict, Field

from .config import (
    CREDENTIAL_NAMES,
    DEFAULT_CLOUD_AGENT_ID,
    DEFAULT_CLOUD_AGENT_URL,
    DEFAULT_CLOUD_PROJECT_ID,
    DEFAULT_CLOUD_URL_HINT,
    DEFAULTS,
    ROOT,
    SessionConfig,
    active_secret_provider,
    agent_name,
    environment,
    list_catalog_models,
    parse_cloud_agent_url,
    write_env_local,
)
from .observability import (
    configure_error_tracking,
    counters,
    error_tracking_enabled,
    record_request,
    unhandled_exception_handler,
)
from .security_guards import (
    cache_control_for,
    enforce_session_rate_limit,
    rate_limits,
    require_write_access,
    resolve_request_id,
    valid_server_url,
    verify_studio_token,
)

__all__ = ["app", "cache_control_for", "rate_limits"]

APP_VERSION = "2.0.0"
STARTED_AT = time.time()

_LOG_LEVEL_NAME = os.environ.get("LOG_LEVEL", "INFO").upper()
_LOG_LEVEL = getattr(logging, _LOG_LEVEL_NAME, logging.INFO)

structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(_LOG_LEVEL),
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
    cache_logger_on_first_use=False,
)
logger = structlog.get_logger("inference-studio.api")

configure_error_tracking(APP_VERSION)

app = FastAPI(
    title="Wave 2.0 Inference Studio API",
    version=APP_VERSION,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
app.add_exception_handler(Exception, unhandled_exception_handler)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    request_id = resolve_request_id(request.headers.get("x-request-id"))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    started = time.perf_counter()
    try:
        origin = request.headers.get("origin")
        if (
            request.method == "POST"
            and origin
            and urlparse(origin).netloc != request.headers.get("host")
        ):
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.warning(
                "http_request",
                method=request.method,
                path=request.url.path,
                status_code=403,
                duration_ms=duration_ms,
                reason="cross_origin_rejected",
            )
            return JSONResponse(
                {"detail": "Cross-origin requests are not allowed."},
                status_code=403,
                headers={"X-Request-ID": request_id},
            )
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        elif response.status_code == 200 and "cache-control" not in response.headers:
            response.headers["Cache-Control"] = cache_control_for(request.url.path)
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "microphone=*, autoplay=*"
        response.headers["Content-Security-Policy"] = "frame-ancestors 'self'"
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=15552000"
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        record_request(response.status_code)
        logger.info(
            "http_request",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=duration_ms,
        )
        return response
    finally:
        structlog.contextvars.clear_contextvars()


@app.get("/api/status")
async def status():
    env = environment()
    missing = [name for name in CREDENTIAL_NAMES if not env[name]]
    valid_url = not env["LIVEKIT_URL"] or valid_server_url(env["LIVEKIT_URL"])
    configured_agent_url = env.get("LIVEKIT_AGENT_URL") or DEFAULT_CLOUD_AGENT_URL
    parsed_project_id, parsed_agent_id = parse_cloud_agent_url(configured_agent_url)
    return {
        "configured": not missing and valid_url,
        "missing": missing,
        "invalid_url": not valid_url,
        "protected": bool(env["STUDIO_ACCESS_TOKEN"]),
        "secret_provider": active_secret_provider(),
        "agent_name": agent_name(),
        "cloud_agent_url": configured_agent_url,
        "cloud_project_id": parsed_project_id or DEFAULT_CLOUD_PROJECT_ID,
        "cloud_agent_id": parsed_agent_id or DEFAULT_CLOUD_AGENT_ID,
        "dispatch_mode": env.get("LIVEKIT_DISPATCH_MODE") or "cloud-bot",
        "sandbox_id": env.get("LIVEKIT_SANDBOX_ID") or "",
        "server_url_hint": DEFAULT_CLOUD_URL_HINT,
        "pipelines": ["stt-llm-tts", "realtime"],
        "server_host": urlparse(env["LIVEKIT_URL"]).hostname
        if env["LIVEKIT_URL"] and valid_url
        else None,
        "note": (
            "Configured does not mean an agent is running. Start the Python or Node.js worker "
            "separately, or dispatch your LiveKit Cloud agent directly."
        ),
    }


class BotSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    agent_url: str = Field(default=DEFAULT_CLOUD_AGENT_URL, max_length=256)
    dispatch_mode: str = Field(
        default="cloud-bot", pattern=r"^(cloud-bot|auto|studio-worker|custom)$"
    )
    custom_agent_name: str = Field(default="", max_length=64, pattern=r"^[A-Za-z0-9_-]*$")
    sandbox_id: str = Field(default="", max_length=128, pattern=r"^[A-Za-z0-9_.-]*$")


@app.post("/api/bot-settings")
async def save_bot_settings(
    body: BotSettingsUpdate,
    request: Request,
    authorization: str | None = Header(default=None),
):
    env = environment()
    verify_studio_token(env, authorization)
    require_write_access(env, request)
    _, parsed_agent_id = parse_cloud_agent_url(body.agent_url)
    resolved_name = (
        (parsed_agent_id or DEFAULT_CLOUD_AGENT_ID)
        if body.dispatch_mode == "cloud-bot"
        else ""
        if body.dispatch_mode == "auto"
        else "inference-studio"
        if body.dispatch_mode == "studio-worker"
        else body.custom_agent_name
    )
    write_env_local(
        {
            "LIVEKIT_AGENT_URL": body.agent_url,
            "LIVEKIT_DISPATCH_MODE": body.dispatch_mode,
            "LIVEKIT_SANDBOX_ID": body.sandbox_id,
            "LIVEKIT_AGENT_NAME": resolved_name,
        }
    )
    return await status()


class CredentialsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    livekit_url: str = Field(min_length=6, max_length=256)
    api_key: str = Field(min_length=4, max_length=128)
    api_secret: str = Field(min_length=8, max_length=256)
    agent_url: str = Field(default=DEFAULT_CLOUD_AGENT_URL, max_length=256)
    agent_name: str = Field(default="", max_length=64, pattern=r"^[A-Za-z0-9_-]*$")


@app.post("/api/credentials")
async def save_credentials(
    body: CredentialsUpdate,
    request: Request,
    authorization: str | None = Header(default=None),
):
    env = environment()
    verify_studio_token(env, authorization)
    require_write_access(env, request)
    if not valid_server_url(body.livekit_url):
        raise HTTPException(
            422,
            detail={
                "code": "invalid_url",
                "message": (
                    "LIVEKIT_URL must be a valid wss:// LiveKit Cloud URL "
                    "(e.g. wss://your-project.livekit.cloud) or ws://localhost:7880."
                ),
            },
        )
    _, parsed_agent_id = parse_cloud_agent_url(body.agent_url)
    resolved_agent_name = body.agent_name or parsed_agent_id or ""
    write_env_local(
        {
            "LIVEKIT_URL": body.livekit_url,
            "LIVEKIT_API_KEY": body.api_key,
            "LIVEKIT_API_SECRET": body.api_secret,
            "LIVEKIT_AGENT_URL": body.agent_url,
            "LIVEKIT_AGENT_NAME": resolved_agent_name,
        }
    )
    return await status()


class SessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    config: SessionConfig = Field(default_factory=SessionConfig)
    agent_name: str | None = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_-]*$")


@app.post("/api/sessions")
async def create_session(
    body: SessionRequest,
    request: Request,
    authorization: str | None = Header(default=None),
):
    env = environment()
    missing = [name for name in CREDENTIAL_NAMES if not env[name]]
    if missing:
        raise HTTPException(
            503,
            detail={
                "code": "not_configured",
                "message": (
                    "Add LiveKit Cloud credentials to .env.local or configure your bot "
                    "in Studio settings first."
                ),
                "missing": missing,
            },
        )
    if not valid_server_url(env["LIVEKIT_URL"]):
        raise HTTPException(
            503,
            detail={
                "code": "invalid_url",
                "message": (
                    "LIVEKIT_URL must be a valid wss:// LiveKit Cloud URL "
                    "(or ws://localhost for self-hosting)."
                ),
            },
        )
    verify_studio_token(env, authorization)
    require_write_access(env, request)
    enforce_session_rate_limit(request)

    suffix = uuid4().hex[:12]
    room_name = f"inference-{suffix}"
    identity = f"user-{suffix}"
    dispatch_target = agent_name() if body.agent_name is None else body.agent_name
    dispatches = (
        [api.RoomAgentDispatch(agent_name=dispatch_target, metadata=body.config.model_dump_json())]
        if dispatch_target
        else []
    )
    room_config = api.RoomConfiguration(
        name=room_name,
        empty_timeout=60,
        departure_timeout=20,
        max_participants=2,
        agents=dispatches,
    )
    token = (
        api.AccessToken(env["LIVEKIT_API_KEY"], env["LIVEKIT_API_SECRET"])
        .with_identity(identity)
        .with_name("You")
        .with_ttl(timedelta(minutes=10))
        .with_grants(
            api.VideoGrants(
                room_join=True,
                room=room_name,
                can_publish=True,
                can_subscribe=True,
                can_publish_data=True,
                can_publish_sources=["microphone"],
                can_update_own_metadata=False,
            )
        )
        .with_room_config(room_config)
        .to_jwt()
    )
    counters.sessions_minted_total += 1
    return {
        "server_url": env["LIVEKIT_URL"],
        "participant_token": token,
        "room_name": room_name,
        "agent_name": dispatch_target,
        "pipeline": body.config.pipeline,
        "expires_in": 600,
    }


@app.get("/api/models")
def get_models(stage: str | None = None, provider: str | None = None) -> dict[str, object]:
    """List allowlisted inference models grouped by pipeline stage."""
    try:
        catalog = list_catalog_models(stage=stage, provider=provider)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_stage", "message": str(exc)},
        ) from exc
    return {"stages": catalog, "defaults": DEFAULTS}


@app.get("/api/health")
async def health():
    """Cheap, unauthenticated readiness probe (used by start.py, publish-wave.ps1, Docker)."""
    env = environment()
    return {
        "status": "ok",
        "service": "inference-studio",
        "version": APP_VERSION,
        "uptime_seconds": int(time.time() - STARTED_AT),
        "configured": all(env[name] for name in CREDENTIAL_NAMES),
        "protected": bool(env["STUDIO_ACCESS_TOKEN"]),
        "secret_provider": active_secret_provider(),
        "error_tracking": error_tracking_enabled(),
        "metrics": counters.snapshot(),
    }


if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
else:

    @app.get("/", include_in_schema=False)
    async def missing_ui_build() -> HTMLResponse:
        """Explain the empty page instead of returning FastAPI's JSON 404."""
        return HTMLResponse(
            "<h1>Wave 2.0 API is running</h1>"
            "<p>The Studio UI is not built yet. Run <code>pnpm install &amp;&amp; pnpm run build</code> "
            "(or <code>python start.py --mode prod</code>, which builds it for you), then restart.</p>",
            status_code=503,
        )
