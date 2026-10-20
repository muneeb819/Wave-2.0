import type { Config } from "./types";

export function snippet(config: Config) {
  return `from livekit.agents import AgentSession, inference

session = AgentSession(
    stt=inference.STT(
        model=${JSON.stringify(config.stt)},
        language=${JSON.stringify(config.language)}
    ),
    llm=inference.LLM(
        model=${JSON.stringify(config.llm)},
    ),
    tts=inference.TTS(
        model=${JSON.stringify(config.tts)},
        voice=${JSON.stringify(config.voice)},
    ),
)`;
}

export function fullAgent(config: Config) {
  return `# Run: python agent.py dev
# Install: pip install 'livekit-agents[silero]==1.8.8' python-dotenv
# Compatible with Inference Studio's room dispatch and dashboard events.
import asyncio
import json
import os
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import Agent, AgentServer, AgentSession, inference, llm, metrics, room_io, TurnHandlingOptions
from livekit.plugins import silero

load_dotenv(".env.local")
DEFAULT_CONFIG = ${JSON.stringify(config, null, 4)}
server = AgentServer()

@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME", "inference-studio"))
async def entrypoint(ctx: agents.JobContext):
    config = DEFAULT_CONFIG.copy()
    # The included token API validates configuration before signing dispatch metadata.
    if ctx.job.metadata:
        supplied = json.loads(ctx.job.metadata)
        if isinstance(supplied, dict):
            config.update({k: v for k, v in supplied.items() if k in config and isinstance(v, str)})
    session = AgentSession(
        stt=inference.STT(model=config["stt"], language=config["language"]),
        llm=inference.LLM(model=config["llm"]),
        tts=inference.TTS(model=config["tts"], voice=config["voice"]),
        vad=silero.VAD.load(),
        turn_handling=TurnHandlingOptions(turn_detection="stt" if "flux" in config["stt"] else "vad"),
    )
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
        agent=Agent(instructions=config["instructions"] + "\\nRespond in " + language + "."),
        record=False,
        room_options=room_io.RoomOptions(text_input=True, audio_input=True, audio_output=True, close_on_disconnect=True),
    )
    emit({"type": "ready", "message": "Voice pipeline connected"})
    await session.generate_reply(instructions="Greet the user and offer your assistance.")

if __name__ == "__main__":
    agents.cli.run_app(server)
`;
}

export const envExample = `# .env.local — server-side only. Never commit this file.
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_AGENT_NAME=inference-studio

# Optional: protect the development token endpoint.
STUDIO_ACCESS_TOKEN=your-strong-random-access-token`;
