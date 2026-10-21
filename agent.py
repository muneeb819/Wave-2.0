"""Standalone LiveKit Agents Quickstart entrypoint (`my-agent`).

Supports both pipelines described in the LiveKit Voice AI Quickstart:
  1. Chained STT-LLM-TTS pipeline (default):
       - STT: AssemblyAI Universal-3.6 Pro (`assemblyai/universal-3-6-pro`)
       - LLM: Google Gemma 4 31B (`google/gemma-4-31b-it`)
       - TTS: Fish Audio S2.1 Pro (`fishaudio/s2.1-pro`)
       - Turn Detection: LiveKit `inference.TurnDetector()` + preemptive generation
       - Keyterms: `STTContextOptions` with live keyterm detection
       - Expressive TTS: `expressive=True`
       - Noise Cancellation: `ai_coustics.audio_enhancement(model=ai_coustics.EnhancerModel.QUAIL_VF_S)`
  2. Realtime Speech-to-Speech model (`LIVEKIT_PIPELINE=realtime`):
       - Model: OpenAI GPT Realtime 2.1 (`openai/gpt-realtime-2.1`) or GPT-Live (`openai/gpt-live-1`)

Usage:
  uv run agent.py console      # Speak to your agent locally in your terminal
  uv run agent.py dev          # Development mode (connect to LiveKit Cloud / Agent Console)
  uv run agent.py start        # Production mode
  lk agent dev                 # Run via LiveKit CLI
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    STTContextOptions,
    TurnHandlingOptions,
    inference,
    room_io,
)
from livekit.plugins import ai_coustics

from backend.agent import (
    Assistant,
    attach_dashboard_events,
    build_room_options,
    build_session,
    parse_job_config,
)

load_dotenv(Path(__file__).resolve().parent / ".env.local")

server = AgentServer()


def build_quickstart_session(
    pipeline: str | None = None,
) -> AgentSession:
    """Construct either the Quickstart STT-LLM-TTS pipeline or Realtime speech-to-speech session."""
    mode = (pipeline or os.getenv("LIVEKIT_PIPELINE", "stt-llm-tts")).strip().lower()
    if mode == "realtime":
        model_id = os.getenv("LIVEKIT_REALTIME_MODEL", "openai/gpt-realtime-2.1")
        voice = os.getenv("LIVEKIT_REALTIME_VOICE", "marin")
        realtime_llm = (
            inference.DuplexModel(model=model_id, voice=voice)
            if inference.is_duplex_model(model_id)
            else inference.RealtimeModel(model=model_id, voice=voice)
        )
        return AgentSession(llm=realtime_llm)

    return AgentSession(
        stt=inference.STT(model="assemblyai/universal-3-6-pro", language="en"),
        llm=inference.LLM(model="google/gemma-4-31b-it"),
        tts=inference.TTS(
            model="fishaudio/s2.1-pro",
            voice="fa4c9eb3dccc4806b382b40d61c6b10a",
        ),
        stt_context_options=STTContextOptions(
            keyterms=["LiveKit", "Wave 2.0"],
            keyterm_detection={"enabled": True},
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection=inference.TurnDetector(),
            preemptive_generation={"enabled": True},
        ),
        expressive=True,
    )


@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME", "my-agent"))
async def my_agent(ctx: agents.JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}

    if ctx.job.metadata:
        session_config = parse_job_config(ctx.job.metadata)
        session = build_session(session_config)
        room_options = build_room_options(session_config)
        agent: Agent = Assistant(
            instructions=session_config.instructions,
            language=session_config.language,
        )
    else:
        session = build_quickstart_session()
        noise_cancellation_enabled = (
            os.getenv("LIVEKIT_NOISE_CANCELLATION", "true").lower() != "false"
        )
        audio_input: bool | room_io.AudioInputOptions = (
            room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_S
                ),
            )
            if noise_cancellation_enabled
            else True
        )
        room_options = room_io.RoomOptions(
            text_input=True,
            audio_input=audio_input,
            audio_output=True,
        )
        agent = Assistant()

    tasks: set[asyncio.Task[None]] = set()

    async def publish(payload):
        import json

        try:
            await ctx.room.local_participant.publish_data(
                json.dumps(payload), reliable=True, topic="inference.events"
            )
        except Exception:
            pass

    def emit(payload):
        task = asyncio.create_task(publish(payload))
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    attach_dashboard_events(session, emit)

    async def cleanup():
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    ctx.add_shutdown_callback(cleanup)

    await session.start(
        room=ctx.room,
        agent=agent,
        room_options=room_options,
    )
    await ctx.connect()
    emit({"type": "ready", "message": "Voice pipeline connected"})
    await session.generate_reply(instructions="Greet the user and offer your assistance.")


if __name__ == "__main__":
    agents.cli.run_app(server)
