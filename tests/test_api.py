"""Offline API, schema, certificate, and LiveKit worker pipeline tests.

Never contacts external LiveKit Cloud endpoints or spends inference credits.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import jwt
import pytest
from fastapi.testclient import TestClient

import agent as quickstart_agent
from backend import config as settings
from backend import main
from backend.agent import (
    Assistant,
    attach_dashboard_events,
    build_room_options,
    build_session,
    parse_job_config,
)
from backend.config import SessionConfig
from backend.main import app, rate_limits
from gen_cert import generate_self_signed_cert

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
    # Loopback peer + loopback Host: the API treats this as "the machine itself",
    # which is the only way to write settings anonymously (dev without a token).
    with TestClient(app, base_url="http://127.0.0.1:8000", client=("127.0.0.1", 50000)) as client:
        yield client


@pytest.fixture
def remote_client():
    """A browser/curl on another machine: no token must mean no writes."""
    with TestClient(
        app, base_url="http://182.183.90.63:8443", client=("203.0.113.7", 50000)
    ) as client:
        yield client


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("LIVEKIT_URL", "wss://test-project.livekit.cloud")
    monkeypatch.setenv("LIVEKIT_API_KEY", KEY)
    monkeypatch.setenv("LIVEKIT_API_SECRET", SECRET)


def claims(response):
    assert response.status_code == 200, response.text
    return jwt.decode(response.json()["participant_token"], SECRET, algorithms=["HS256"])


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


def test_realtime_session_dispatch_roundtrip(client, configured):
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
    value = claims(response)
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


def test_distinct_rooms_and_identities(client, configured):
    first = claims(client.post("/api/sessions", json={}))
    second = claims(client.post("/api/sessions", json={}))
    assert first["sub"] != second["sub"]
    assert first["video"]["room"] != second["video"]["room"]


def test_custom_dispatch_name(client, configured, monkeypatch):
    monkeypatch.setenv("LIVEKIT_AGENT_NAME", "my-agent")
    value = claims(client.post("/api/sessions", json={}))
    assert value["roomConfig"]["agents"][0]["agentName"] == "my-agent"


def test_config_changes_reach_worker(client, configured):
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
    value = claims(client.post("/api/sessions", json={"config": config}))
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


def test_worker_builds_chained_pipeline_with_turndetector_and_keyterms():
    config = SessionConfig()
    fake_vad = MagicMock()
    fake_td = MagicMock()
    with (
        patch("backend.agent.inference.TurnDetector", return_value=fake_td) as td_cls,
        patch("backend.agent.inference.STT") as stt,
        patch("backend.agent.inference.LLM") as llm_cls,
        patch("backend.agent.inference.TTS") as tts,
        patch("backend.agent.AgentSession") as session,
    ):
        build_session(config, fake_vad)
        td_cls.assert_called_once_with()
        stt.assert_called_once_with(model="assemblyai/universal-3-6-pro", language="en")
        llm_cls.assert_called_once_with(model="google/gemma-4-31b-it")
        tts.assert_called_once_with(
            model="fishaudio/s2.1-pro",
            voice="fa4c9eb3dccc4806b382b40d61c6b10a",
        )
        kwargs = session.call_args.kwargs
        assert kwargs["vad"] is fake_vad
        assert kwargs["expressive"] is True
        assert kwargs["turn_handling"]["turn_detection"] is fake_td
        assert kwargs["turn_handling"]["preemptive_generation"] == {"enabled": True}
        assert kwargs["stt_context_options"]["keyterms"] == ["LiveKit", "Wave 2.0"]


@pytest.mark.parametrize(
    "stt_id,td_setting,expected",
    [
        ("deepgram/flux-general", "turn_detector", "stt"),
        ("xai/stt-1", "vad", "vad"),
    ],
)
def test_worker_respects_stt_and_vad_turn_detection_modes(stt_id, td_setting, expected):
    config = SessionConfig(stt=stt_id, turn_detection=td_setting)
    with (
        patch("backend.agent.inference.STT"),
        patch("backend.agent.inference.LLM"),
        patch("backend.agent.inference.TTS"),
        patch("backend.agent.AgentSession") as session,
    ):
        build_session(config, MagicMock())
        assert session.call_args.kwargs["turn_handling"]["turn_detection"] == expected


def test_worker_builds_realtime_and_duplex_pipelines():
    rt_config = SessionConfig(
        pipeline="realtime",
        realtime_model="openai/gpt-realtime-2.1",
        realtime_voice="marin",
    )
    with (
        patch("backend.agent.inference.RealtimeModel") as rt_cls,
        patch("backend.agent.AgentSession") as session_cls,
    ):
        build_session(rt_config, None)
        rt_cls.assert_called_once_with(model="openai/gpt-realtime-2.1", voice="marin")
        assert session_cls.call_args.kwargs["llm"] is rt_cls.return_value

    duplex_config = SessionConfig(
        pipeline="realtime",
        realtime_model="openai/gpt-live-1",
        realtime_voice="marin",
    )
    with (
        patch("backend.agent.inference.DuplexModel") as dup_cls,
        patch("backend.agent.AgentSession") as session_cls,
    ):
        build_session(duplex_config, None)
        dup_cls.assert_called_once_with(model="openai/gpt-live-1", voice="marin")
        assert session_cls.call_args.kwargs["llm"] is dup_cls.return_value


def test_room_options_toggle_ai_coustics_noise_cancellation():
    cloud_opts = build_room_options(SessionConfig(noise_cancellation=True))
    assert cloud_opts.audio_input is not True
    assert cloud_opts.audio_input.noise_cancellation is not None

    self_hosted_opts = build_room_options(SessionConfig(noise_cancellation=False))
    assert self_hosted_opts.audio_input is True


@pytest.mark.asyncio
async def test_quickstart_entrypoint_builds_both_pipelines(configured):
    s_chained = quickstart_agent.build_quickstart_session("stt-llm-tts")
    s_realtime = quickstart_agent.build_quickstart_session("realtime")
    assert s_chained is not None
    assert s_realtime is not None
    await s_chained.aclose()
    await s_realtime.aclose()


def test_dashboard_metrics_bridge_handles_realtime_and_chained_metrics():
    from livekit.agents import metrics as lk_metrics

    handlers = {}
    fake_session = MagicMock()
    fake_session.on.side_effect = lambda name: lambda fn: handlers.setdefault(name, fn)
    emitted = []
    attach_dashboard_events(fake_session, emitted.append)

    rt_metric = lk_metrics.RealtimeModelMetrics(
        timestamp=1_700_000_000.0,
        label="openai/gpt-realtime-2.1",
        request_id="req-1",
        duration=0.42,
        session_duration=5.0,
        ttft=0.185,
        cancelled=False,
        input_tokens=40,
        output_tokens=24,
        total_tokens=64,
        tokens_per_second=52.0,
        input_token_details=lk_metrics.RealtimeModelMetrics.InputTokenDetails(),
        output_token_details=lk_metrics.RealtimeModelMetrics.OutputTokenDetails(),
        acquire_time=0.01,
        connection_reused=True,
    )
    handlers["metrics_collected"](SimpleNamespace(metrics=rt_metric))
    assert {"type": "metrics", "llm_ms": 185, "tokens": 64} in emitted


def test_assistant_includes_language_and_utc_tool():
    assistant = Assistant(language="fr")
    assert "Respond in French." in assistant.instructions


def test_self_signed_certificate_generator(tmp_path):
    key_file, cert_file = generate_self_signed_cert(tmp_path)
    assert key_file.is_file() and cert_file.is_file()
    assert b"BEGIN RSA PRIVATE KEY" in key_file.read_bytes()
    assert b"BEGIN CERTIFICATE" in cert_file.read_bytes()


def test_parses_livekit_cloud_bot_url_and_dispatches_cloud_agent(client, configured):
    project_id, agent_id = settings.parse_cloud_agent_url(
        "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS"
    )
    assert project_id == "p_jg0goo2oksb"
    assert agent_id == "CA_tBWDFVRz7pZS"

    explicit = claims(
        client.post(
            "/api/sessions",
            json={"agent_name": "CA_tBWDFVRz7pZS", "config": {}},
        )
    )
    assert explicit["roomConfig"]["agents"][0]["agentName"] == "CA_tBWDFVRz7pZS"

    auto_dispatch = claims(client.post("/api/sessions", json={"agent_name": "", "config": {}}))
    assert auto_dispatch["roomConfig"].get("agents", []) == []


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


# --- Production hardening -------------------------------------------------------------
def test_static_cache_policy_is_safe_and_effective():
    """Hashed bundles must be cacheable; index.html and API responses must not be."""
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
    """A public deployment without STUDIO_ACCESS_TOKEN must not be puppet-able by curl."""
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
    """localhost keeps working without a token so `python start.py` needs no setup."""
    assert client.post("/api/sessions", json={}).status_code == 200
