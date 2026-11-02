"""Unit tests for LiveKit worker pipeline construction, metrics events, and TLS cert generation."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

import agent as quickstart_agent
from backend.agent import (
    Assistant,
    attach_dashboard_events,
    build_room_options,
    build_session,
)
from backend.config import SessionConfig
from gen_cert import generate_self_signed_cert


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
