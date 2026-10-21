import type { Config, SdkKind } from "./types";

function pythonTurnDetectionExpr(config: Config): string {
  if (config.stt.includes("flux") || config.turn_detection === "stt") {
    return '"stt"';
  }
  if (config.turn_detection === "vad") {
    return '"vad"';
  }
  return "inference.TurnDetector()";
}

function pythonRealtimeExpr(config: Config): string {
  const cls =
    config.realtime_model === "openai/gpt-live-1"
      ? "DuplexModel"
      : "RealtimeModel";
  return `inference.${cls}(
        model=${JSON.stringify(config.realtime_model)},
        voice=${JSON.stringify(config.realtime_voice)},
    )`;
}

export function snippet(config: Config, sdk: SdkKind = "python"): string {
  if (sdk === "node") {
    if (config.pipeline === "realtime") {
      return `import { Agent, inference, voice } from '@livekit/agents';

const agent = Agent.create({
  instructions: ${JSON.stringify(config.instructions)},
  llm: new inference.DuplexModel({
    model: ${JSON.stringify(config.realtime_model)},
    voice: ${JSON.stringify(config.realtime_voice)},
  }),
});

const session = new voice.AgentSession({});`;
    }
    return `import { inference, voice } from '@livekit/agents';

const session = new voice.AgentSession({
  stt: new inference.STT({
    model: ${JSON.stringify(config.stt)},
    language: ${JSON.stringify(config.language)},
  }),
  keytermsOptions: {
    keyterms: ${JSON.stringify(config.keyterms)},
    keytermDetection: { enabled: true },
  },
  tts: new inference.TTS({
    model: ${JSON.stringify(config.tts)},
    voice: ${JSON.stringify(config.voice)},
  }),
  turnHandling: {
    turnDetection: new inference.TurnDetector(),
    preemptiveGeneration: { enabled: ${String(config.preemptive_generation)} },
  },
  expressive: ${String(config.expressive)},
});`;
  }

  if (config.pipeline === "realtime") {
    return `from livekit.agents import AgentSession, inference

session = AgentSession(
    llm=${pythonRealtimeExpr(config)},
)`;
  }

  return `from livekit.agents import (
    AgentSession,
    STTContextOptions,
    TurnHandlingOptions,
    inference,
)

session = AgentSession(
    stt=inference.STT(
        model=${JSON.stringify(config.stt)},
        language=${JSON.stringify(config.language)},
    ),
    llm=inference.LLM(
        model=${JSON.stringify(config.llm)},
    ),
    tts=inference.TTS(
        model=${JSON.stringify(config.tts)},
        voice=${JSON.stringify(config.voice)},
    ),
    stt_context_options=STTContextOptions(
        keyterms=${JSON.stringify(config.keyterms)},
        keyterm_detection={"enabled": True},
    ),
    turn_handling=TurnHandlingOptions(
        turn_detection=${pythonTurnDetectionExpr(config)},
        preemptive_generation={"enabled": ${config.preemptive_generation ? "True" : "False"}},
    ),
    expressive=${config.expressive ? "True" : "False"},
)`;
}

export function quickstartAgent(config: Config): string {
  const aiCousticsImport = config.noise_cancellation
    ? "from livekit.plugins import ai_coustics\n"
    : "";
  const roomOptionsBlock = config.noise_cancellation
    ? `        room_options=room_io.RoomOptions(
            audio_input=room_io.AudioInputOptions(
                noise_cancellation=ai_coustics.audio_enhancement(
                    model=ai_coustics.EnhancerModel.QUAIL_VF_S
                ),
            ),
        ),`
    : `        room_options=room_io.RoomOptions(
            audio_input=True,
        ),`;

  const sessionBlock =
    config.pipeline === "realtime"
      ? `    session = AgentSession(
        llm=${pythonRealtimeExpr(config).replace(/\n/g, "\n    ")},
    )`
      : `    session = AgentSession(
        stt=inference.STT(model=${JSON.stringify(config.stt)}, language=${JSON.stringify(config.language)}),
        llm=inference.LLM(model=${JSON.stringify(config.llm)}),
        tts=inference.TTS(
            model=${JSON.stringify(config.tts)},
            voice=${JSON.stringify(config.voice)},
        ),
        stt_context_options=STTContextOptions(
            keyterms=${JSON.stringify(config.keyterms)},
            keyterm_detection={"enabled": True},
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection=${pythonTurnDetectionExpr(config)},
            preemptive_generation={"enabled": ${config.preemptive_generation ? "True" : "False"}},
        ),
        expressive=${config.expressive ? "True" : "False"},
    )`;

  const importsLine =
    config.pipeline === "realtime"
      ? "from livekit.agents import Agent, AgentServer, AgentSession, inference, room_io"
      : "from livekit.agents import Agent, AgentServer, AgentSession, STTContextOptions, TurnHandlingOptions, inference, room_io";

  return `# Run locally: uv run agent.py console
# Connect to LiveKit Cloud / Agent Console: lk agent dev
from dotenv import load_dotenv

from livekit import agents
${importsLine}
${aiCousticsImport}
load_dotenv(".env.local")


class Assistant(Agent):
    def __init__(self) -> None:
        super().__init__(
            instructions=${JSON.stringify(config.instructions)},
        )


server = AgentServer()


@server.rtc_session(agent_name="my-agent")
async def my_agent(ctx: agents.JobContext):
${sessionBlock}

    await session.start(
        room=ctx.room,
        agent=Assistant(),
${roomOptionsBlock}
    )

    await ctx.connect()
    await session.generate_reply(
        instructions="Greet the user and offer your assistance."
    )


if __name__ == "__main__":
    agents.cli.run_app(server)
`;
}

export function fullAgent(config: Config): string {
  const pyConfig = JSON.stringify(config, null, 4)
    .replace(/\btrue\b/g, "True")
    .replace(/\bfalse\b/g, "False")
    .replace(/\bnull\b/g, "None");
  return `# Run: uv run python agent.py dev
# Install: uv sync && uv run python -m livekit.agents download-files
# Compatible with Wave 2.0 room dispatch, Realtime & STT-LLM-TTS pipelines, and dashboard events.
import asyncio
import json
import os
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    STTContextOptions,
    TurnHandlingOptions,
    inference,
    llm,
    metrics,
    room_io,
)
from livekit.plugins import ai_coustics, silero

load_dotenv(".env.local")
DEFAULT_CONFIG = ${pyConfig}
server = AgentServer()


def build_session(config, vad):
    if config["pipeline"] == "realtime":
        rt_llm = (
            inference.DuplexModel(model=config["realtime_model"], voice=config["realtime_voice"])
            if inference.is_duplex_model(config["realtime_model"])
            else inference.RealtimeModel(model=config["realtime_model"], voice=config["realtime_voice"])
        )
        return AgentSession(llm=rt_llm, vad=vad)

    turn_detection = (
        "stt"
        if ("flux" in config["stt"] or config["turn_detection"] == "stt")
        else ("vad" if config["turn_detection"] == "vad" else inference.TurnDetector())
    )
    return AgentSession(
        stt=inference.STT(model=config["stt"], language=config["language"]),
        llm=inference.LLM(model=config["llm"]),
        tts=inference.TTS(model=config["tts"], voice=config["voice"]),
        vad=vad,
        stt_context_options=STTContextOptions(
            keyterms=list(config["keyterms"]),
            keyterm_detection={"enabled": True},
        ),
        turn_handling=TurnHandlingOptions(
            turn_detection=turn_detection,
            preemptive_generation={"enabled": bool(config["preemptive_generation"])},
        ),
        expressive=bool(config["expressive"]),
    )


@server.rtc_session(agent_name=os.getenv("LIVEKIT_AGENT_NAME", "inference-studio"))
async def entrypoint(ctx: agents.JobContext):
    config = dict(DEFAULT_CONFIG)
    if ctx.job.metadata:
        supplied = json.loads(ctx.job.metadata)
        if isinstance(supplied, dict):
            config.update({k: v for k, v in supplied.items() if k in config})

    session = build_session(config, silero.VAD.load())
    tasks = set()

    async def publish(payload):
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
        elif isinstance(metric, metrics.RealtimeModelMetrics):
            emit({"type": "metrics", "llm_ms": round(metric.ttft * 1000), "tokens": metric.total_tokens})

    @session.on("error")
    def failed(event):
        if not getattr(event.error, "recoverable", False):
            emit({"type": "error", "message": "A model request failed. Check your worker logs and Cloud balance."})

    async def cleanup():
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    ctx.add_shutdown_callback(cleanup)
    language = {"en": "English", "es": "Spanish", "fr": "French", "de": "German", "pt": "Portuguese", "it": "Italian"}.get(config["language"], "English")
    audio_input = (
        room_io.AudioInputOptions(
            noise_cancellation=ai_coustics.audio_enhancement(
                model=ai_coustics.EnhancerModel.QUAIL_VF_S
            ),
        )
        if config["noise_cancellation"]
        else True
    )
    await session.start(
        room=ctx.room,
        agent=Agent(instructions=config["instructions"] + "\\nRespond in " + language + "."),
        record=False,
        room_options=room_io.RoomOptions(
            text_input=True,
            audio_input=audio_input,
            audio_output=True,
            close_on_disconnect=True,
        ),
    )
    await ctx.connect()
    emit({"type": "ready", "pipeline": config["pipeline"], "message": "Voice pipeline connected"})
    await session.generate_reply(instructions="Greet the user and offer your assistance.")


if __name__ == "__main__":
    agents.cli.run_app(server)
`;
}

export function nodeAgent(config: Config): string {
  const noiseImport = config.noise_cancellation
    ? "import { EnhancerModel, audioEnhancement } from '@livekit/plugins-ai-coustics';\n"
    : "";
  const inputOptions = config.noise_cancellation
    ? `      inputOptions: {
        noiseCancellation: audioEnhancement({ model: EnhancerModel.QuailVfS }),
      },`
    : "";

  const agentLlm =
    config.pipeline === "realtime"
      ? `new inference.DuplexModel({
        model: ${JSON.stringify(config.realtime_model)},
        voice: ${JSON.stringify(config.realtime_voice)},
      })`
      : `new inference.LLM({ model: ${JSON.stringify(config.llm)} })`;

  const sessionInit =
    config.pipeline === "realtime"
      ? "const session = new voice.AgentSession({});"
      : `const session = new voice.AgentSession({
      stt: new inference.STT({
        model: ${JSON.stringify(config.stt)},
        language: ${JSON.stringify(config.language)},
      }),
      keytermsOptions: {
        keyterms: ${JSON.stringify(config.keyterms)},
        keytermDetection: { enabled: true },
      },
      tts: new inference.TTS({
        model: ${JSON.stringify(config.tts)},
        voice: ${JSON.stringify(config.voice)},
      }),
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        preemptiveGeneration: { enabled: ${String(config.preemptive_generation)} },
      },
      expressive: ${String(config.expressive)},
    });`;

  return `// Install: pnpm install (Node.js >= 20, pnpm >= 10.15.0)
// Run dev: lk agent dev
import { Agent, ServerOptions, cli, defineAgent, inference, voice } from '@livekit/agents';
${noiseImport}import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';

dotenv.config({ path: '.env.local' });

export default defineAgent({
  entry: async (ctx) => {
    ${sessionInit}

    await session.start({
      agent: Agent.create({
        instructions: ${JSON.stringify(config.instructions)},
        llm: ${agentLlm},
      }),
      room: ctx.room,
${inputOptions}
    });

    await ctx.connect();
    session.generateReply({
      instructions: 'Greet the user and offer your assistance.',
    });
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    agentName: process.env.LIVEKIT_AGENT_NAME || 'my-agent',
  }),
);
`;
}

export const envExample = `# .env.local — server-side only. Never commit this file.
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your-livekit-api-key
LIVEKIT_API_SECRET=your-livekit-api-secret
LIVEKIT_AGENT_NAME=inference-studio

# Optional standalone Quickstart settings:
LIVEKIT_PIPELINE=stt-llm-tts
LIVEKIT_REALTIME_MODEL=openai/gpt-realtime-2.1
LIVEKIT_REALTIME_VOICE=marin
LIVEKIT_NOISE_CANCELLATION=true

# Optional: protect the development token endpoint.
STUDIO_ACCESS_TOKEN=your-strong-random-access-token`;
