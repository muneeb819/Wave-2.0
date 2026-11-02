"""Authentication, loopback write protection, URL validation, and rate-limiting guards."""

from __future__ import annotations

import hashlib
import hmac
import re
import time
from collections import defaultdict, deque
from urllib.parse import urlparse
from uuid import uuid4

from fastapi import HTTPException, Request

LOCAL_HOSTNAMES = frozenset({"localhost", "127.0.0.1", "::1"})
FINGERPRINTED_ASSET = re.compile(
    r"-[A-Za-z0-9_-]{8,}\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|gif|svg|webp|ico|map)$"
)
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")

rate_limits: dict[str, deque[float]] = defaultdict(deque)


def cache_control_for(path: str) -> str:
    """Cache policy per path: tokens are never cached, hashed assets are immutable."""
    if FINGERPRINTED_ASSET.search(path):
        return "public, max-age=31536000, immutable"
    if path in ("/", "/index.html"):
        return "no-cache"
    return "public, max-age=3600"


def resolve_request_id(incoming: str | None) -> str:
    """Propagate a safe caller-supplied X-Request-ID or mint a fresh identifier."""
    candidate = (incoming or "").strip()
    if candidate and REQUEST_ID_PATTERN.match(candidate):
        return candidate
    return uuid4().hex


def is_local_request(request: Request) -> bool:
    """True only for a request from this machine to a loopback host name."""
    client = request.client
    peer = client.host if client else ""
    if peer.startswith("::ffff:"):
        peer = peer[7:]
    if peer not in LOCAL_HOSTNAMES:
        return False
    hostname = urlparse(f"//{request.headers.get('host', '')}").hostname
    return hostname in LOCAL_HOSTNAMES


def require_write_access(env: dict[str, str], request: Request) -> None:
    """Refuse anonymous writes from the network when no access token is configured."""
    if env["STUDIO_ACCESS_TOKEN"] or is_local_request(request):
        return
    raise HTTPException(
        403,
        detail={
            "code": "token_required",
            "message": (
                "This Studio is reachable from the network without STUDIO_ACCESS_TOKEN. "
                "Add one to .env.local to change settings or start sessions remotely."
            ),
        },
    )


def valid_server_url(value: str) -> bool:
    """Validate LiveKit signaling URLs (`wss://` or loopback `ws://`)."""
    try:
        parsed = urlparse(value)
        _ = parsed.port
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


def verify_studio_token(env: dict[str, str], authorization: str | None) -> None:
    """Verify constant-time Bearer token when STUDIO_ACCESS_TOKEN is configured."""
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


def enforce_session_rate_limit(request: Request, *, max_per_minute: int = 8) -> None:
    """Apply bounded per-IP sliding-window rate limiting to session minting."""
    now = time.monotonic()
    client_ip = request.client.host if request.client else "unknown"
    limiter_key = hashlib.sha256(client_ip.encode()).hexdigest()
    if limiter_key not in rate_limits and len(rate_limits) >= 4096:
        del rate_limits[next(iter(rate_limits))]
    bucket = rate_limits[limiter_key]
    while bucket and bucket[0] < now - 60:
        bucket.popleft()
    if len(bucket) >= max_per_minute:
        raise HTTPException(
            429,
            detail={
                "code": "rate_limited",
                "message": "Too many session requests. Please wait a minute.",
            },
            headers={"Retry-After": "60"},
        )
    bucket.append(now)
    if len(rate_limits) > 4096:
        for key in list(rate_limits):
            if not rate_limits[key] or rate_limits[key][-1] < now - 60:
                del rate_limits[key]
