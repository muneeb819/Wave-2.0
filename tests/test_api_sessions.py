"""Tests for room-scoped session token minting, catalog validation, and agent dispatch."""

from __future__ import annotations

import json

import pytest

from backend import config as settings
from backend.agent import parse_job_config
from backend.config import SessionConfig

KEY = "test-livekit-key"
SECRET = "test-livekit-secret-at-least-thirty-two-characters"


def test_exact_quickstart_defaults():
    value = SessionConfig()
    assert value.pipeline == "stt-llm-tts"
    assert value.stt == "assemblyai/universal-3-6-pro"
    assert value.llm == "google/gemma-4-31b-it"
    assert value.tts == "fishaudio/s2.1-pro"
    assert value.voice == "fa4c9eb3dccc4806b382b40d61c6b10a"
    assert value.realtime_model == "openai/gpt-realtime-2.1"
    assert value.realtime_voice == "marin"
    assert value.language == "en"
    assert value.turn_detection == "turn_detector"
    assert value.noise_cancellation is True
    assert value.preemptive_generation is True
    assert value.expressive is True
    assert value.keyterms == ["LiveKit", "Wave 2.0"]


def test_token_is_room_scoped_and_short_lived(client, configured, decode_claims):
    response = client.post("/api/sessions", json={"config": {}})
    value = decode_claims(response)
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


def test_explicit_dispatch_contains_validated_config(client, configured, decode_claims):
    response = client.post("/api/sessions", json={"config": {}})
    value = decode_claims(response)
    room = value["roomConfig"]
    assert room["maxParticipants"] == 2
    assert room["agents"][0]["agentName"] == "inference-studio"
    metadata = json.loads(room["agents"][0]["metadata"])
    assert metadata == SessionConfig().model_dump()


def test_realtime_session_dispatch_roundtrip(client, configured, decode_claims):
    response = client.post(
        "/api/sessions",
        json={
            "config": {
                "pipeline": "realtime",
                "realtime_model": "openai/gpt-realtime-2.1",
                "realtime_voice": "cedar",
                "noise_cancellation": False,
            }
        },
    )
    assert response.json()["pipeline"] == "realtime"
    value = decode_claims(response)
    parsed = parse_job_config(value["roomConfig"]["agents"][0]["metadata"])
    assert parsed.pipeline == "realtime"
    assert parsed.realtime_model == "openai/gpt-realtime-2.1"
    assert parsed.realtime_voice == "cedar"
    assert parsed.noise_cancellation is False


def test_parse_job_config_handles_malformed_metadata():
    fallback = parse_job_config("{not-valid-json")
    assert fallback == SessionConfig()
    fallback_bad_model = parse_job_config(json.dumps({"stt": "evil/model"}))
    assert fallback_bad_model == SessionConfig()


def test_distinct_rooms_and_identities(client, configured, decode_claims):
    first = decode_claims(client.post("/api/sessions", json={}))
    second = decode_claims(client.post("/api/sessions", json={}))
    assert first["sub"] != second["sub"]
    assert first["video"]["room"] != second["video"]["room"]


def test_custom_dispatch_name(client, configured, monkeypatch, decode_claims):
    monkeypatch.setenv("LIVEKIT_AGENT_NAME", "my-agent")
    value = decode_claims(client.post("/api/sessions", json={}))
    assert value["roomConfig"]["agents"][0]["agentName"] == "my-agent"


def test_config_changes_reach_worker(client, configured, decode_claims):
    config = {
        "pipeline": "stt-llm-tts",
        "stt": "deepgram/nova-3",
        "language": "es",
        "llm": "openai/gpt-4.1-mini",
        "tts": "fishaudio/s2-pro",
        "voice": "my-custom-voice",
        "realtime_model": "openai/gpt-realtime-2.1",
        "realtime_voice": "marin",
        "turn_detection": "vad",
        "noise_cancellation": False,
        "preemptive_generation": False,
        "expressive": False,
        "keyterms": ["Madrid", "LiveKit"],
        "instructions": "Be a concise and friendly travel assistant.",
    }
    value = decode_claims(client.post("/api/sessions", json={"config": config}))
    assert json.loads(value["roomConfig"]["agents"][0]["metadata"]) == config


@pytest.mark.parametrize("kind", ["stt", "llm", "tts", "realtime_model"])
def test_rejects_unsupported_models(client, configured, kind):
    assert client.post("/api/sessions", json={"config": {kind: "unknown/model"}}).status_code == 422


def test_flux_language_is_validated(client, configured):
    assert (
        client.post(
            "/api/sessions",
            json={"config": {"stt": "deepgram/flux-general", "language": "es"}},
        ).status_code
        == 422
    )


@pytest.mark.parametrize(
    "config",
    [
        {"voice": "bad voice with spaces"},
        {"voice": ""},
        {"realtime_voice": "bad voice!"},
        {"instructions": "short"},
        {"instructions": "x" * 8001},
        {"api_key": "never-allow-client-provider-keys"},
        {"language": "xx"},
        {"pipeline": "invalid"},
        {"keyterms": ["bad$symbol!"]},
    ],
)
def test_rejects_invalid_settings(client, configured, config):
    assert client.post("/api/sessions", json={"config": config}).status_code == 422


def test_parses_livekit_cloud_bot_url_and_dispatches_cloud_agent(client, configured, decode_claims):
    project_id, agent_id = settings.parse_cloud_agent_url(
        "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS"
    )
    assert project_id == "p_jg0goo2oksb"
    assert agent_id == "CA_tBWDFVRz7pZS"

    explicit = decode_claims(
        client.post(
            "/api/sessions",
            json={"agent_name": "CA_tBWDFVRz7pZS", "config": {}},
        )
    )
    assert explicit["roomConfig"]["agents"][0]["agentName"] == "CA_tBWDFVRz7pZS"

    auto_dispatch = decode_claims(
        client.post("/api/sessions", json={"agent_name": "", "config": {}})
    )
    assert auto_dispatch["roomConfig"].get("agents", []) == []


def test_models_endpoint_supports_stage_and_provider_filtering(client):
    all_models = client.get("/api/models")
    assert all_models.status_code == 200
    body = all_models.json()
    assert {"stt", "llm", "tts", "realtime"} <= set(body["stages"].keys())
    assert body["defaults"]["stt"] == "assemblyai/universal-3-6-pro"

    filtered = client.get("/api/models", params={"stage": "llm", "provider": "google"})
    assert filtered.status_code == 200
    llm_items = filtered.json()["stages"]["llm"]
    assert llm_items and all(item["id"].startswith("google/") for item in llm_items)

    bad_stage = client.get("/api/models", params={"stage": "unknown"})
    assert bad_stage.status_code == 400
    assert bad_stage.json()["detail"]["code"] == "invalid_stage"
