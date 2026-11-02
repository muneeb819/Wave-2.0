"""Unit tests for backend.security_guards and /api/bot-settings dispatch modes."""

from __future__ import annotations

from collections import deque

from starlette.requests import Request

from backend import config as settings
from backend.security_guards import (
    enforce_session_rate_limit,
    is_local_request,
    rate_limits,
    valid_server_url,
)


def _make_request(peer: str, host_header: str) -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/api/sessions",
        "headers": [(b"host", host_header.encode("latin-1"))],
        "client": (peer, 54321),
    }
    return Request(scope)


def test_ipv6_mapped_loopback_and_host_validation():
    assert is_local_request(_make_request("::ffff:127.0.0.1", "127.0.0.1:8000")) is True
    assert is_local_request(_make_request("::1", "[::1]:8000")) is True
    assert is_local_request(_make_request("127.0.0.1", "evil.example.com")) is False


def test_valid_server_url_rejects_malformed_ports_and_whitespace():
    assert valid_server_url("wss://example.livekit.cloud:notaport") is False
    assert valid_server_url("wss://example.livekit.cloud/path with space") is False
    assert valid_server_url("ws://[::1]:7880") is True


def test_rate_limiter_evicts_oldest_bucket_past_capacity():
    rate_limits.clear()
    for idx in range(4096):
        rate_limits[f"bucket-{idx}"] = deque([0.0])
    req = _make_request("127.0.0.1", "127.0.0.1:8000")
    enforce_session_rate_limit(req)
    assert len(rate_limits) <= 4096


def test_bot_settings_persists_all_dispatch_modes(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ROOT", tmp_path)
    for mode, custom in (
        ("cloud-bot", ""),
        ("auto", ""),
        ("studio-worker", ""),
        ("custom", "my_bot"),
    ):
        res = client.post(
            "/api/bot-settings",
            json={
                "agent_url": "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS",
                "dispatch_mode": mode,
                "custom_agent_name": custom,
                "sandbox_id": "sbx-123",
            },
        )
        assert res.status_code == 200
    assert (tmp_path / ".env.local").is_file()
