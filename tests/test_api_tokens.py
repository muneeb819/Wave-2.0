"""Tests for authentication, credentials persistence, rate limiting, and security headers."""

from __future__ import annotations

import json

import pytest

from backend import config as settings
from backend import main

KEY = "test-livekit-key"
SECRET = "test-livekit-secret-at-least-thirty-two-characters"


def test_health(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["service"] == "inference-studio"
    assert body["version"] == "2.0.0"
    assert isinstance(body["uptime_seconds"], int)
    assert body["protected"] is False


def test_health_reports_token_protection(client, monkeypatch):
    monkeypatch.setenv("STUDIO_ACCESS_TOKEN", "a-long-public-token-value")
    body = client.get("/api/health").json()
    assert body["protected"] is True


def test_missing_configuration(client):
    value = client.get("/api/status").json()
    assert not value["configured"]
    assert value["missing"] == list(settings.CREDENTIAL_NAMES)
    assert value["pipelines"] == ["stt-llm-tts", "realtime"]
    assert not value["invalid_url"]
    response = client.post("/api/sessions", json={"config": {}})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "not_configured"


def test_status_never_exposes_secrets(client, configured):
    response = client.get("/api/status")
    value = response.json()
    assert value["configured"]
    assert value["server_host"] == "test-project.livekit.cloud"
    assert KEY not in response.text and SECRET not in response.text
    assert "does not mean an agent is running" in value["note"]


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:7880",
        "https://example.com",
        "wss://",
        "wss://user:pass@example.com",
        "ws://remote.example.com:7880",
        "ws://user:pass@localhost:7880",
    ],
)
def test_rejects_invalid_server_urls(client, configured, monkeypatch, url):
    monkeypatch.setenv("LIVEKIT_URL", url)
    assert not client.get("/api/status").json()["configured"]
    assert client.post("/api/sessions", json={}).status_code == 503


def test_allows_localhost_self_hosted_ws_url(client, configured, monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "ws://localhost:7880")
    assert client.get("/api/status").json()["configured"]
    assert client.post("/api/sessions", json={}).status_code == 200


def test_optional_studio_auth(client, configured, monkeypatch):
    monkeypatch.setenv("STUDIO_ACCESS_TOKEN", "studio-test-password")
    assert client.get("/api/status").json()["protected"]
    assert client.post("/api/sessions", json={}).status_code == 401
    assert (
        client.post("/api/sessions", json={}, headers={"Authorization": "Bearer wrong"}).status_code
        == 401
    )
    assert (
        client.post(
            "/api/sessions",
            json={},
            headers={"Authorization": "Bearer studio-test-password"},
        ).status_code
        == 200
    )


def test_rate_limiter(client, configured):
    for _ in range(8):
        assert client.post("/api/sessions", json={}).status_code == 200
    response = client.post("/api/sessions", json={})
    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"


def test_cross_origin_browser_post_rejected(client, configured):
    assert (
        client.post(
            "/api/sessions", json={}, headers={"Origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/sessions", json={}, headers={"Origin": "http://127.0.0.1:8000"}
        ).status_code
        == 200
    )


def test_sensitive_responses_are_not_cached(client, configured):
    response = client.post("/api/sessions", json={})
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


def test_save_credentials_writes_0600_env_without_exposing_secrets(client, tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "ROOT", tmp_path)
    monkeypatch.setattr(
        settings,
        "dotenv_values",
        lambda path: (
            dict(
                line.split("=", 1)
                for line in path.read_text(encoding="utf-8").splitlines()
                if "=" in line
            )
            if path.is_file()
            else {}
        ),
    )
    res = client.post(
        "/api/credentials",
        json={
            "livekit_url": "wss://medicare-bot-z2uz9h17.livekit.cloud",
            "api_key": KEY,
            "api_secret": SECRET,
            "agent_url": "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS",
            "agent_name": "CA_tBWDFVRz7pZS",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["configured"] is True
    assert body["agent_name"] == "CA_tBWDFVRz7pZS"
    assert body["cloud_project_id"] == "p_jg0goo2oksb"
    assert body["cloud_agent_id"] == "CA_tBWDFVRz7pZS"
    assert KEY not in res.text and SECRET not in res.text
    env_file = tmp_path / ".env.local"
    assert env_file.is_file()
    assert (env_file.stat().st_mode & 0o777) == 0o600


def test_static_cache_policy_is_safe_and_effective():
    assert main.cache_control_for("/assets/index-CDzJ3y_0.js") == (
        "public, max-age=31536000, immutable"
    )
    assert main.cache_control_for("/assets/index-3UTyLq2y.css").endswith("immutable")
    assert "immutable" in main.cache_control_for(
        "/assets/jetbrains-mono-latin-500-normal-CJOVTJB7.woff"
    )
    assert main.cache_control_for("/") == "no-cache"
    assert main.cache_control_for("/index.html") == "no-cache"
    assert "immutable" not in main.cache_control_for("/wave2.0.png")


def test_security_headers_on_api_and_static_responses(client):
    for path in ("/api/health", "/api/status"):
        response = client.get(path)
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["x-frame-options"] == "SAMEORIGIN"
        assert response.headers["referrer-policy"] == "no-referrer"
        assert response.headers["content-security-policy"] == "frame-ancestors 'self'"
        assert response.headers["permissions-policy"] == "microphone=*, autoplay=*"
        assert response.headers["cache-control"] == "no-store"


def test_hsts_only_when_served_over_tls(client):
    assert "strict-transport-security" not in client.get("/api/health").headers
    response = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
    assert response.headers["strict-transport-security"] == "max-age=15552000"


def test_remote_writes_need_a_token_when_none_is_configured(remote_client, configured):
    credentials = {
        "livekit_url": "wss://attacker.livekit.cloud",
        "api_key": KEY,
        "api_secret": SECRET,
    }
    for path, payload in (
        ("/api/credentials", credentials),
        ("/api/bot-settings", {}),
        ("/api/sessions", {}),
    ):
        response = remote_client.post(path, json=payload)
        assert response.status_code == 403, (path, response.text)
        assert response.json()["detail"]["code"] == "token_required"


def test_remote_writes_are_allowed_with_the_configured_token(
    remote_client, configured, monkeypatch
):
    token = "remote-token-0123456789abcdef"
    monkeypatch.setenv("STUDIO_ACCESS_TOKEN", token)
    allowed = remote_client.post(
        "/api/sessions", json={}, headers={"Authorization": f"Bearer {token}"}
    )
    assert allowed.status_code == 200
    denied = remote_client.post("/api/sessions", json={})
    assert denied.status_code == 401


def test_local_writes_stay_open_for_development(client, configured):
    assert client.post("/api/sessions", json={}).status_code == 200


def test_structured_logging_and_request_id_propagation(client, capsys):
    auto_res = client.get("/api/health")
    generated_id = auto_res.headers["x-request-id"]
    assert len(generated_id) == 32

    capsys.readouterr()
    traced = client.get("/api/status", headers={"X-Request-ID": "req-wave2-trace-42"})
    assert traced.headers["x-request-id"] == "req-wave2-trace-42"
    raw_lines = [line for line in capsys.readouterr().out.splitlines() if line.strip()]
    assert raw_lines
    log_entry = json.loads(raw_lines[-1])
    assert log_entry["event"] == "http_request"
    assert log_entry["method"] == "GET"
    assert log_entry["path"] == "/api/status"
    assert log_entry["status_code"] == 200
    assert log_entry["request_id"] == "req-wave2-trace-42"
    assert isinstance(log_entry["duration_ms"], (int, float))

    sanitized = client.get("/api/health", headers={"X-Request-ID": "bad id with spaces!"})
    assert sanitized.headers["x-request-id"] != "bad id with spaces!"
    assert len(sanitized.headers["x-request-id"]) == 32
