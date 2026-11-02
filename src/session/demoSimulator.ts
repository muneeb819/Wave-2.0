import { HistoryEntrySchema } from "../schemas";
import { formatTime, getModel } from "../types";
import type { Config, HistoryEntry, Metrics } from "../types";

export const HISTORY_STORAGE_KEY = "inference-studio:history";

export function demoReply(text: string, config: Config): string {
  const lower = text.toLowerCase();
  if (/hello|hi\b|hey\b/.test(lower)) {
    return config.pipeline === "realtime"
      ? `Hey! Good to meet you. This is a local demo of your ${getModel("realtime", config.realtime_model).name} speech-to-speech pipeline. What would you like to explore?`
      : "Hey! Good to meet you. This is a local demo of your voice agent. What would you like to know about the inference pipeline?";
  }
  if (/\b(weather|time|news|today)\b/.test(lower)) {
    return "I'm a local demo, so I can't check live information yet. In Live mode, your LiveKit Cloud bot executes tools directly on LiveKit Cloud.";
  }
  if (/code|python|node|build|start|connect|setup/.test(lower)) {
    return "Connect your LiveKit Cloud project (API keys or Sandbox ID) in Configuration, then switch this playground to Live to speak directly with your bot.";
  }
  if (/voice|fish|speech|sound/.test(lower)) {
    return config.pipeline === "realtime"
      ? `Your speech-to-speech model ${getModel("realtime", config.realtime_model).name} streams native audio directly with voice "${config.realtime_voice}" without a separate TTS hop.`
      : `Your text-to-speech model is ${getModel("tts", config.tts).name} (${getModel("tts", config.tts).provider}). With expressive mode enabled, LiveKit Inference renders natural tone and pacing automatically.`;
  }
  if (/model|pipeline|inference|work|latency|livekit|realtime/.test(lower)) {
    return config.pipeline === "realtime"
      ? `In Realtime mode, ${getModel("realtime", config.realtime_model).name} processes your spoken audio directly end-to-end speech-to-speech through LiveKit Inference with ${config.noise_cancellation ? "ai-coustics QUAIL VF-S noise cancellation" : "direct audio input"}.`
      : `In a live session, ${getModel("stt", config.stt).name} transcribes your speech, ${getModel("llm", config.llm).name} generates a reply, and ${getModel("tts", config.tts).name} turns it into audio with LiveKit TurnDetector and ${config.noise_cancellation ? "ai-coustics noise cancellation" : "local audio input"}.`;
  }
  return "That's a great prompt for your agent. This demo uses scripted replies rather than a live model. Switch to Live once your Cloud credentials are saved to talk directly with your bot.";
}

export function demoMetricsFor(pipeline: Config["pipeline"]): Metrics {
  return pipeline === "realtime"
    ? {
        transcription_ms: 95,
        endpointing_ms: 140,
        llm_ms: 195,
        tts_ms: 0,
        tokens: 52,
      }
    : {
        transcription_ms: 142,
        endpointing_ms: 180,
        llm_ms: 218,
        tts_ms: 164,
        tokens: 46,
      };
}

export function loadHistory(): HistoryEntry[] {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(HISTORY_STORAGE_KEY) || "[]",
    );
    if (!Array.isArray(value)) return [];
    const valid: HistoryEntry[] = [];
    for (const candidate of value.slice(0, 20)) {
      const parsed = HistoryEntrySchema.safeParse(candidate);
      if (parsed.success) {
        valid.push(parsed.data as HistoryEntry);
      }
    }
    return valid;
  } catch {
    return [];
  }
}

export function persistHistory(history: HistoryEntry[]): void {
  try {
    sessionStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    /* Browser storage may be disabled/full. */
  }
}

export function formatTranscriptMarkdown(entry: HistoryEntry): string {
  const stack =
    entry.config.pipeline === "realtime"
      ? entry.config.realtime_model
      : `${entry.config.stt} -> ${entry.config.llm} -> ${entry.config.tts}`;
  const header = [
    `# Voice Session ${entry.id.slice(0, 8)}`,
    `- **Mode**: ${entry.mode}`,
    `- **Duration**: ${formatTime(entry.duration)}`,
    `- **Pipeline**: \`${stack}\``,
    "",
    "## Transcript",
  ];
  const turns = entry.messages.length
    ? entry.messages.map((msg) => {
        const speaker = msg.role === "assistant" ? "Agent" : "User";
        const suffix = msg.interrupted ? " _(interrupted)_" : "";
        return `- **${speaker}**${suffix}: ${msg.text}`;
      })
    : ["_No messages were exchanged in this session._"];
  return [...header, ...turns, ""].join("\n");
}
