"""Small development token service. Add application auth before public deployment."""

from __future__ import annotations

import hashlib
import hmac
import time
from collections import defaultdict, deque
from datetime import timedelta
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from livekit import api
from pydantic import BaseModel, ConfigDict, Field

from .config import (
    CREDENTIAL_NAMES,
    DEFAULT_CLOUD_AGENT_ID,
    DEFAULT_CLOUD_AGENT_URL,
    DEFAULT_CLOUD_PROJECT_ID,
    DEFAULT_CLOUD_URL_HINT,
    ROOT,
    SessionConfig,
    agent_name,
    environment,
    parse_cloud_agent_url,
    write_env_local,
)

app = FastAPI(
    title="Wave 2.0 Inference Studio API",
    version="2.0.0",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    redoc_url=None,
)
# A per-process, in-memory development limiter. Use a shared limiter behind production auth.
rate_limits: dict[str, deque[float]] = defaultdict(deque)


@app.middleware("http")
async def no_cache_tokens(request: Request, call_next):
    # The frontend and API use a same-origin Vite proxy; reject cross-origin browser POSTs.
    origin = request.headers.get("origin")
    if (
        request.method == "POST"
        and origin
        and urlparse(origin).netloc != request.headers.get("host")
    ):
        return JSONResponse({"detail": "Cross-origin requests are not allowed."}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Permissions-Policy"] = "microphone=*, autoplay=*"
    return response


def valid_server_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        _ = parsed.port  # Validate the port and bracketed IPv6, if present.
        allowed_scheme = parsed.scheme == "wss" or (
            parsed.scheme == "ws" and parsed.hostname in ("localhost", "127.0.0.1", "::1")
        )
        return bool(
            allowed_scheme
            and parsed.hostname
            and not parsed.username
            and not parsed.password
            and not any(c.isspace() for c in value)
        )
    except ValueError:
        return False


def _verify_studio_token(env: dict[str, str], authorization: str | None) -> None:
    if env["STUDIO_ACCESS_TOKEN"]:
        expected = f"Bearer {env['STUDIO_ACCESS_TOKEN']}"
        if not hmac.compare_digest((authorization or "").encode(), expected.encode()):
            raise HTTPException(
                401,
                detail={
                    "code": "unauthorized",
                    "message": "Enter your Studio access token in the connection settings.",
                },
            )


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
        "note": "Configured does not mean an agent is running. Start the Python or Node.js worker separately, or dispatch your LiveKit Cloud agent directly.",
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
    authorization: str | None = Header(default=None),
):
    env = environment()
    _verify_studio_token(env, authorization)
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
    authorization: str | None = Header(default=None),
):
    env = environment()
    _verify_studio_token(env, authorization)
    if not valid_server_url(body.livekit_url):
        raise HTTPException(
            422,
            detail={
                "code": "invalid_url",
                "message": "LIVEKIT_URL must be a valid wss:// LiveKit Cloud URL (e.g. wss://your-project.livekit.cloud) or ws://localhost:7880.",
            },
        )
    _, parsed_agent_id = parse_cloud_agent_url(body.agent_url)
    resolved_agent_name = body.agent_name
    if not resolved_agent_name and parsed_agent_id:
        resolved_agent_name = parsed_agent_id

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
                "message": "Add LiveKit Cloud credentials to .env.local or configure your bot in Studio settings first.",
                "missing": missing,
            },
        )
    if not valid_server_url(env["LIVEKIT_URL"]):
        raise HTTPException(
            503,
            detail={
                "code": "invalid_url",
                "message": "LIVEKIT_URL must be a valid wss:// LiveKit Cloud URL (or ws://localhost for self-hosting).",
            },
        )
    _verify_studio_token(env, authorization)

    now = time.monotonic()
    # Do not trust arbitrary X-Forwarded-For headers. Production should use an authenticated user ID.
    client_ip = request.client.host if request.client else "unknown"
    limiter_key = hashlib.sha256(client_ip.encode()).hexdigest()
    if limiter_key not in rate_limits and len(rate_limits) >= 4096:
        del rate_limits[next(iter(rate_limits))]
    bucket = rate_limits[limiter_key]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= 8:
        raise HTTPException(
            429,
            detail={
                "code": "rate_limited",
                "message": "Too many session requests. Please wait a minute.",
            },
            headers={"Retry-After": "60"},
        )
    bucket.append(now)
    # Bound memory even if the development server receives many distinct IPs.
    if len(rate_limits) > 4096:
        for key in list(rate_limits):
            if not rate_limits[key] or rate_limits[key][-1] < now - 60:
                del rate_limits[key]

    suffix = uuid4().hex[:12]
    room_name = f"inference-{suffix}"
    identity = f"user-{suffix}"
    dispatch_target = agent_name() if body.agent_name is None else body.agent_name
    dispatches = (
        [api.RoomAgentDispatch(agent_name=dispatch_target, metadata=body.config.model_dump_json())]
        if dispatch_target
        else []
    )
    # Dispatch on room join: supports explicit Cloud Agent ID (`CA_...`), local worker, or automatic dispatch (`""`).
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
    return {
        "server_url": env["LIVEKIT_URL"],
        "participant_token": token,
        "room_name": room_name,
        "agent_name": dispatch_target,
        "pipeline": body.config.pipeline,
        "expires_in": 600,
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "inference-studio"}


# Build once with npm run build, then serve UI + API from this single HTTP process.
if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
