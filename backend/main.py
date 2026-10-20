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
from pydantic import BaseModel, Field

from .config import CREDENTIAL_NAMES, ROOT, SessionConfig, agent_name, environment

app = FastAPI(
    title="Inference Studio API",
    version="1.0.0",
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
        return JSONResponse(
            {"detail": "Cross-origin requests are not allowed."}, status_code=403
        )
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def valid_server_url(value: str) -> bool:
    try:
        parsed = urlparse(value)
        _ = parsed.port  # Validate the port and bracketed IPv6, if present.
        return bool(
            parsed.scheme == "wss"
            and parsed.hostname
            and not parsed.username
            and not parsed.password
            and not any(c.isspace() for c in value)
        )
    except ValueError:
        return False


@app.get("/api/status")
async def status():
    env = environment()
    missing = [name for name in CREDENTIAL_NAMES if not env[name]]
    valid_url = not env["LIVEKIT_URL"] or valid_server_url(env["LIVEKIT_URL"])
    return {
        "configured": not missing and valid_url,
        "missing": missing,
        "invalid_url": not valid_url,
        "protected": bool(env["STUDIO_ACCESS_TOKEN"]),
        "agent_name": agent_name(),
        "server_host": urlparse(env["LIVEKIT_URL"]).hostname
        if env["LIVEKIT_URL"] and valid_url
        else None,
        "note": "Configured does not mean an agent is running. Start the Python worker separately.",
    }


class SessionRequest(BaseModel):
    config: SessionConfig = Field(default_factory=SessionConfig)


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
                "message": "Add LiveKit Cloud credentials to .env.local first.",
                "missing": missing,
            },
        )
    if not valid_server_url(env["LIVEKIT_URL"]):
        raise HTTPException(
            503,
            detail={
                "code": "invalid_url",
                "message": "LIVEKIT_URL must be a valid wss:// LiveKit Cloud URL.",
            },
        )
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
    # Dispatch on room join: only this room and this allow-listed configuration are embedded.
    room_config = api.RoomConfiguration(
        name=room_name,
        empty_timeout=60,
        departure_timeout=20,
        max_participants=2,
        agents=[
            api.RoomAgentDispatch(
                agent_name=agent_name(), metadata=body.config.model_dump_json()
            )
        ],
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
        "agent_name": agent_name(),
        "expires_in": 600,
    }


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "inference-studio"}


# Build once with npm run build, then serve UI + API from this single HTTP process.
if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
