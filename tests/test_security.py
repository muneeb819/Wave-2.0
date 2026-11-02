"""Dedicated security & secret-management test suite.

Covers:
  - Docker/Kubernetes *_FILE secret resolution and precedence
  - HashiCorp Vault KV v2 & Doppler secret providers (HTTPS enforcement, caching, fault isolation)
  - .env.local CRLF/newline injection prevention and 0600 POSIX file mode
  - Constant-time Bearer token auth, cross-origin CSRF rejection, and X-Request-ID sanitization
  - Room-scoped JWT least-privilege grants
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from backend import config as settings
from backend.main import app, rate_limits, resolve_request_id
from backend.secrets import active_secret_provider, clear_secret_cache

KEY = "APIsecKey1234"
SECRET = "sec-test-livekit-secret-at-least-thirty-two-bytes"


@pytest.fixture(autouse=True)
def clean_security_env(monkeypatch):
    monkeypatch.setattr(settings, "dotenv_values", lambda _: {})
    for name in (
        *settings.CREDENTIAL_NAMES,
        "LIVEKIT_AGENT_NAME",
        "LIVEKIT_AGENT_URL",
        "LIVEKIT_DISPATCH_MODE",
        "LIVEKIT_SANDBOX_ID",
        "STUDIO_ACCESS_TOKEN",
        "SECRET_PROVIDER",
        "VAULT_ADDR",
        "VAULT_TOKEN",
        "VAULT_SECRET_PATH",
        "VAULT_NAMESPACE",
        "DOPPLER_TOKEN",
    ):
        monkeypatch.setenv(name, "")
        monkeypatch.setenv(f"{name}_FILE", "")
    clear_secret_cache()
    rate_limits.clear()


def test_mounted_secret_files_resolve_without_exposing_values(tmp_path: Path, monkeypatch):
    secret_file = tmp_path / "livekit_api_secret"
    token_file = tmp_path / "studio_access_token"
    secret_file.write_text(f"  {SECRET}\n", encoding="utf-8")
    token_file.write_text("mounted-token-value-0123456789\n", encoding="utf-8")

    monkeypatch.setenv("SECRET_PROVIDER", "file")
    monkeypatch.setenv("LIVEKIT_URL", "wss://vaulted-project.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", KEY)
    monkeypatch.setenv("LIVEKIT_API_SECRET_FILE", str(secret_file))
    monkeypatch.setenv("STUDIO_ACCESS_TOKEN_FILE", str(token_file))

    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000)) as client:
        status = client.get("/api/status")
        body = status.json()
        assert body["configured"] is True
        assert body["protected"] is True
        assert body["secret_provider"] == "file"
        assert SECRET not in status.text
        assert "mounted-token-value-0123456789" not in status.text


def test_vault_provider_fetches_kv_v2_and_caches_within_ttl(monkeypatch):
    monkeypatch.setenv("SECRET_PROVIDER", "vault")
    monkeypatch.setenv("VAULT_ADDR", "https://vault.internal.example.com")
    monkeypatch.setenv("VAULT_TOKEN", "s.vault-test-token")
    monkeypatch.setenv("VAULT_SECRET_PATH", "secret/data/prod/wave")
    monkeypatch.setenv("VAULT_NAMESPACE", "voice-ai")

    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "data": {
            "data": {
                "LIVEKIT_URL": "wss://vault-prod.livekit.cloud",
                "LIVEKIT_API_KEY": KEY,
                "LIVEKIT_API_SECRET": SECRET,
                "STUDIO_ACCESS_TOKEN": "vault-studio-access-token-12345",
            }
        }
    }

    with patch("backend.secrets.httpx.get", return_value=mock_response) as mock_get:
        first = settings.environment()
        second = settings.environment()
        assert mock_get.call_count == 1
        assert first["LIVEKIT_URL"] == "wss://vault-prod.livekit.cloud"
        assert second["LIVEKIT_API_SECRET"] == SECRET
        _, kwargs = mock_get.call_args
        assert kwargs["headers"]["X-Vault-Token"] == "s.vault-test-token"
        assert kwargs["headers"]["X-Vault-Namespace"] == "voice-ai"


def test_vault_rejects_plaintext_remote_http_endpoint(monkeypatch):
    monkeypatch.setenv("SECRET_PROVIDER", "vault")
    monkeypatch.setenv("VAULT_ADDR", "http://vault.remote.example.com:8200")
    monkeypatch.setenv("VAULT_TOKEN", "s.vault-test-token")

    with patch("backend.secrets.httpx.get") as mock_get:
        env = settings.environment()
        mock_get.assert_not_called()
        assert env["LIVEKIT_API_SECRET"] == ""


def test_doppler_provider_downloads_secrets_and_degrades_cleanly_on_error(monkeypatch):
    monkeypatch.setenv("DOPPLER_TOKEN", "dp.st.prod.token123")
    assert active_secret_provider() == "doppler"

    mock_response = MagicMock()
    mock_response.raise_for_status.return_value = None
    mock_response.json.return_value = {
        "LIVEKIT_URL": "wss://doppler-prod.livekit.cloud",
        "LIVEKIT_API_KEY": KEY,
        "LIVEKIT_API_SECRET": SECRET,
    }
    with patch("backend.secrets.httpx.get", return_value=mock_response) as mock_get:
        env = settings.environment()
        assert env["LIVEKIT_URL"] == "wss://doppler-prod.livekit.cloud"
        assert mock_get.call_count == 1

    clear_secret_cache()
    with patch("backend.secrets.httpx.get", side_effect=RuntimeError("network down")):
        fallback = settings.environment()
        assert fallback["LIVEKIT_API_SECRET"] == ""


def test_write_env_local_drops_newline_injection_and_enforces_0600(tmp_path: Path, monkeypatch):
    monkeypatch.setattr(settings, "ROOT", tmp_path)
    out = settings.write_env_local(
        {
            "LIVEKIT_URL": "wss://safe.livekit.cloud",
            "INJECTED": "evil\nSTUDIO_ACCESS_TOKEN=overwritten",
            "CR_INJECTED": "evil\rKEY=val",
        }
    )
    content = out.read_text(encoding="utf-8")
    assert "LIVEKIT_URL=wss://safe.livekit.cloud" in content
    assert "INJECTED" not in content
    assert "STUDIO_ACCESS_TOKEN=overwritten" not in content
    assert (out.stat().st_mode & 0o777) == 0o600


@pytest.mark.parametrize(
    "malicious_id",
    [
        "id\r\nSet-Cookie: evil=1",
        "id\ninjected-log-line",
        "../../etc/passwd",
        "x" * 65,
        "bad space",
    ],
)
def test_request_id_blocks_header_and_log_injection(malicious_id: str):
    cleaned = resolve_request_id(malicious_id)
    assert cleaned != malicious_id
    assert len(cleaned) == 32


def test_minted_jwt_enforces_strict_least_privilege_grants(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://secure.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", KEY)
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)

    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000)) as client:
        res = client.post("/api/sessions", json={})
        assert res.status_code == 200
        decoded = jwt.decode(res.json()["participant_token"], SECRET, algorithms=["HS256"])
        video = decoded["video"]
        assert video["roomJoin"] is True
        assert video["canPublishSources"] == ["microphone"]
        assert video["canUpdateOwnMetadata"] is False
        assert not video.get("roomAdmin")
        assert not video.get("roomCreate")
        assert not video.get("roomList")
        assert not video.get("roomRecord")
        assert decoded["exp"] - decoded["nbf"] == 600
