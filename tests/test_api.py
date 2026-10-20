"""Offline tests. These never contact LiveKit or spend inference credits."""

import json
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

from backend import config as settings
from backend.config import SessionConfig
from backend.main import app, rate_limits

KEY = "test-livekit-key"
SECRET = "test-livekit-secret-at-least-thirty-two-characters"


@pytest.fixture(autouse=True)
def isolated_environment(monkeypatch):
    monkeypatch.setattr(settings, "dotenv_values", lambda _: {})
    for name in (
        *settings.CREDENTIAL_NAMES,
        "LIVEKIT_AGENT_NAME",
        "STUDIO_ACCESS_TOKEN",
    ):
        monkeypatch.setenv(name, "")
    rate_limits.clear()


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://test-project.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", KEY)
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)


def claims(response):
    assert response.status_code == 200, response.text
    return jwt.decode(
        response.json()["participant_token"], SECRET, algorithms=["HS256"]
    )


def test_health(client):
    assert client.get("/api/health").json()["status"] == "ok"


def test_exact_requested_defaults():
    value = SessionConfig()
    assert value.stt == "xai/stt-1"
    assert value.llm == "google/gemma-4-31b-it"
    assert value.tts == "fishaudio/s2.1-pro"
    assert value.voice == "fa4c9eb3dccc4806b382b40d61c6b10a"
    assert value.language == "en"


def test_missing_configuration(client):
    value = client.get("/api/status").json()
    assert not value["configured"]
    assert value["missing"] == list(settings.CREDENTIAL_NAMES)
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


def test_token_is_room_scoped_and_short_lived(client, configured):
    response = client.post("/api/sessions", json={"config": {}})
    value = claims(response)
    grants = value["video"]
    assert grants["roomJoin"] is True
    assert grants["room"] == response.json()["room_name"]
    assert grants["canPublishSources"] == ["microphone"]
    assert grants["canUpdateOwnMetadata"] is False
    assert not grants.get("roomAdmin") and not grants.get("roomCreate")
    assert value["exp"] - value["nbf"] == 600
    assert value["iss"] == KEY
    assert value["sub"].startswith("user-")
    assert SECRET not in response.text


def test_explicit_dispatch_contains_validated_config(client, configured):
    response = client.post("/api/sessions", json={"config": {}})
    value = claims(response)
    room = value["roomConfig"]
    assert room["maxParticipants"] == 2
    assert room["agents"][0]["agentName"] == "inference-studio"
    metadata = json.loads(room["agents"][0]["metadata"])
    assert metadata == SessionConfig().model_dump()


def test_distinct_rooms_and_identities(client, configured):
    first = claims(client.post("/api/sessions", json={}))
    second = claims(client.post("/api/sessions", json={}))
    assert first["sub"] != second["sub"]
    assert first["video"]["room"] != second["video"]["room"]


def test_custom_dispatch_name(client, configured, monkeypatch):
    monkeypatch.setenv("LIVEKIT_AGENT_NAME", "my-custom-worker")
    value = claims(client.post("/api/sessions", json={}))
    assert value["roomConfig"]["agents"][0]["agentName"] == "my-custom-worker"


def test_config_changes_reach_worker(client, configured):
    config = {
        "stt": "deepgram/nova-3",
        "language": "es",
        "llm": "openai/gpt-4.1-mini",
        "tts": "fishaudio/s2-pro",
        "voice": "my-custom-voice",
        "instructions": "Be a concise and friendly travel assistant.",
    }
    value = claims(client.post("/api/sessions", json={"config": config}))
    assert json.loads(value["roomConfig"]["agents"][0]["metadata"]) == config


@pytest.mark.parametrize("kind", ["stt", "llm", "tts"])
def test_rejects_unsupported_models(client, configured, kind):
    assert (
        client.post(
            "/api/sessions", json={"config": {kind: "unknown/model"}}
        ).status_code
        == 422
    )


def test_flux_language_is_validated(client, configured):
    assert (
        client.post("/api/sessions", json={"config": {"stt": "deepgram/flux-general", "language": "es"}}).status_code
        == 422
    )


@pytest.mark.parametrize(
    "config",
    [
        {"voice": "bad voice with spaces"},
        {"voice": ""},
        {"instructions": "short"},
        {"instructions": "x" * 8001},
        {"api_key": "never-allow-client-provider-keys"},
        {"language": "xx"},
    ],
)
def test_rejects_invalid_settings(client, configured, config):
    assert client.post("/api/sessions", json={"config": config}).status_code == 422


@pytest.mark.parametrize(
    "url",
    [
        "http://localhost:7880",
        "https://example.com",
        "wss://",
        "wss://user:pass@example.com",
    ],
)
def test_rejects_invalid_server_urls(client, configured, monkeypatch, url):
    monkeypatch.setenv("LIVEKIT_URL", url)
    assert not client.get("/api/status").json()["configured"]
    assert client.post("/api/sessions", json={}).status_code == 503


def test_optional_studio_auth(client, configured, monkeypatch):
    monkeypatch.setenv("STUDIO_ACCESS_TOKEN", "studio-test-password")
    assert client.get("/api/status").json()["protected"]
    assert client.post("/api/sessions", json={}).status_code == 401
    assert (
        client.post(
            "/api/sessions", json={}, headers={"Authorization": "Bearer wrong"}
        ).status_code
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
            "/api/sessions", json={}, headers={"Origin": "http://testserver"}
        ).status_code
        == 200
    )


def test_sensitive_responses_are_not_cached(client, configured):
    response = client.post("/api/sessions", json={})
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["x-content-type-options"] == "nosniff"


@pytest.mark.parametrize(
    "stt_id,turn_detection",
    [("xai/stt-1", "vad"), ("deepgram/flux-general", "stt"), ("deepgram/nova-3", "vad")],
)
def test_worker_builds_requested_pipeline_without_network(stt_id, turn_detection):
    from backend.agent import build_session

    config = SessionConfig(stt=stt_id)
    fake_vad = MagicMock()
    with (
        patch("backend.agent.inference.STT") as stt,
        patch("backend.agent.inference.LLM") as llm,
        patch("backend.agent.inference.TTS") as tts,
        patch("backend.agent.AgentSession") as session,
    ):
        build_session(config, fake_vad)
        stt.assert_called_once_with(model=config.stt, language="en")
        llm.assert_called_once_with(model=config.llm)
        tts.assert_called_once_with(model=config.tts, voice=config.voice)
        assert session.call_args.kwargs["turn_handling"]["turn_detection"] == turn_detection
        assert session.call_args.kwargs["vad"] is fake_vad


def test_xai_english_dispatch_preserves_other_default_models(client, configured):
    payload = claims(client.post("/api/sessions", json={"config": {}}))
    config = json.loads(payload["roomConfig"]["agents"][0]["metadata"])
    assert config["stt"] == "xai/stt-1"
    assert config["language"] == "en"
    assert config["llm"] == "google/gemma-4-31b-it"
    assert config["tts"] == "fishaudio/s2.1-pro"
    assert config["voice"] == "fa4c9eb3dccc4806b382b40d61c6b10a"
