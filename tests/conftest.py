"""Shared pytest fixtures for Wave 2.0 offline API and worker tests."""

from __future__ import annotations

import jwt
import pytest
from fastapi.testclient import TestClient

from backend import config as settings
from backend.main import app, rate_limits
from backend.secrets import clear_secret_cache

KEY = "test-livekit-key"
SECRET = "test-livekit-secret-at-least-thirty-two-characters"


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    monkeypatch.setattr(settings, "dotenv_values", lambda _: {})
    for name in (
        *settings.CREDENTIAL_NAMES,
        "LIVEKIT_AGENT_NAME",
        "STUDIO_ACCESS_TOKEN",
        "SECRET_PROVIDER",
        "VAULT_ADDR",
        "VAULT_TOKEN",
        "VAULT_NAMESPACE",
        "VAULT_SECRET_PATH",
        "DOPPLER_TOKEN",
        "DOPPLER_API_URL",
    ):
        monkeypatch.setenv(name, "")
        monkeypatch.setenv(f"{name}_FILE", "")
    clear_secret_cache()
    rate_limits.clear()


@pytest.fixture
def client():
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000)) as c:
        yield c


@pytest.fixture
def remote_client():
    with TestClient(app, base_url="http://182.183.90.63:8443", client=("203.0.113.7", 50000)) as c:
        yield c


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://test-project.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", KEY)
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)


@pytest.fixture
def decode_claims():
    def _decode(response):
        assert response.status_code == 200, response.text
        return jwt.decode(response.json()["participant_token"], SECRET, algorithms=["HS256"])

    return _decode
