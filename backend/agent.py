"""LiveKit Cloud STT -> LLM -> TTS worker, dispatched as `inference-studio`.

Run from the repository root: python -m backend.agent dev
Compatible with Inference Studio's room dispatch and dashboard events.
"""

from __future__ import annotations

import asyncio
import json
import logging
from pathlib import Path

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    JobContext,
    TurnHandlingOptions,
    inference,
    llm,
    metrics,
    room_io,
)
from livekit.plugins import silero

from .config import SessionConfig, agent_name

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env.local")
logger = logging.getLogger("inference-studio.agent")

DEFAULT_CONFIG = {
    "stt": "xai/stt-1",
    "llm": "google/gemma-4-31b-it",
    "tts": "fishaudio/s2.1-pro",
    "language": "en",
    "voice": "fa4c9eb3dccc4806b382b40d61c6b10a",
    "instructions": "You are a helpful voice AI assistant. Be warm, curious, and concise. Give clear, conversational answers, usually in two or three sentences. Avoid markdown, emojis, and complex formatting because your replies are spoken aloud.",
}


def build_session(config: SessionConfig, vad) -> AgentSession:
    # Flux emits end-of-turn events. Other listed STT models use the local VAD.
    return AgentSession(
        stt=inference.STT(model=config.stt, language=config.language),
        llm=inference.LLM(model=config.llm),
        tts=inference.TTS(model=config.tts, voice=config.voice),
        vad=vad,
        turn_handling=TurnHandlingOptions(
            turn_detection="stt" if "flux" in config.stt else "vad",
        ),
    )


server = AgentServer()


@server.rtc_session(agent_name=agent_name())
async def entrypoint(ctx: JobContext):
    config = DEFAULT_CONFIG.copy()
    # The included token API validates configuration before signing dispatch metadata.
    if ctx.job.metadata:
        try:
            supplied = json.loads(ctx.job.metadata)
        except (json.JSONDecodeError, TypeError):
            supplied = None
        if isinstance(supplied, dict):
            config.update(
                {k: v for k, v in supplied.items() if k in config and isinstance(v, str)}
            )

    session_config = SessionConfig(**{k: config[k] for k in ("stt", "llm", "tts", "language", "voice", "instructions")})
    session = build_session(session_config, silero.VAD.load())

    tasks = set()

    async def publish(payload):
        try:
            await ctx.room.local_participant.publish_data(
                json.dumps(payload), reliable=True, topic="inference.events"
            )
        except Exception:
            pass  # The participant may have disconnected.

    def emit(payload):
        task = asyncio.create_task(publish(payload))
        tasks.add(task)
        task.add_done_callback(tasks.discard)

    @session.on("agent_state_changed")
    def state_changed(event):
        emit({"type": "state", "state": event.new_state})

    @session.on("user_input_transcribed")
    def transcribed(event):
        emit({"type": "partial", "text": "" if event.is_final else event.transcript})

    @session.on("conversation_item_added")
    def message_added(event):
        item = event.item
        if isinstance(item, llm.ChatMessage) and item.role in ("user", "assistant") and item.text_content:
            emit({"type": "message", "id": item.id, "role": item.role,
                  "text": item.text_content, "timestamp": item.created_at * 1000,
                  "interrupted": item.interrupted})

    @session.on("metrics_collected")
    def collected(event):
        metric = event.metrics
        if isinstance(metric, metrics.EOUMetrics):
            emit({"type": "metrics", "transcription_ms": round(metric.transcription_delay * 1000),
                  "endpointing_ms": round(metric.end_of_utterance_delay * 1000)})
        elif isinstance(metric, metrics.LLMMetrics):
            emit({"type": "metrics", "llm_ms": round(metric.ttft * 1000), "tokens": metric.total_tokens})
        elif isinstance(metric, metrics.TTSMetrics):
            emit({"type": "metrics", "tts_ms": round(metric.ttfb * 1000)})

    @session.on("error")
    def failed(event):
        if not getattr(event.error, "recoverable", False):
            emit({"type": "error", "message": "A model request failed. Check your worker logs and Cloud balance."})

    async def cleanup():
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    ctx.add_shutdown_callback(cleanup)
    language = {"en": "English", "es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese", "it": "Italian"}.get(config["language"], "English")
    await ctx.connect()
    await session.start(
        room=ctx.room,
        agent=Agent(instructions=config["instructions"] + "\nRespond in " + language + "."),
        record=False,
        room_options=room_io.RoomOptions(text_input=True, audio_input=True, audio_output=True, close_on_disconnect=True),
    )
    emit({"type": "ready", "message": "Voice pipeline connected"})
    await session.generate_reply(instructions="Greet the user and offer your assistance.")


if __name__ == "__main__":
    agents.cli.run_app(server)
