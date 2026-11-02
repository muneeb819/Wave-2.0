import { z } from "zod";
import { catalog } from "./types";

const sttIds = new Set(catalog.stt.map((m) => m.id));
const llmIds = new Set(catalog.llm.map((m) => m.id));
const ttsIds = new Set(catalog.tts.map((m) => m.id));
const realtimeIds = new Set(catalog.realtime.map((m) => m.id));
const languageIds = new Set(catalog.languages.map((l) => l.id));

export const VOICE_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
export const KEYTERM_RE = /^[A-Za-z0-9][A-Za-z0-9 .,'&/_-]{0,63}$/;

export function isValidLiveKitUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || /\s/.test(trimmed) || trimmed.length > 256) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.username || parsed.password || !parsed.hostname) return false;
    if (parsed.protocol === "wss:") return true;
    if (
      parsed.protocol === "ws:" &&
      (parsed.hostname === "localhost" ||
        parsed.hostname === "127.0.0.1" ||
        parsed.hostname === "[::1]" ||
        parsed.hostname === "::1")
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const LiveKitUrlSchema = z
  .string()
  .trim()
  .min(6)
  .max(256)
  .refine(isValidLiveKitUrl, {
    message:
      "LIVEKIT_URL must be a wss:// Cloud URL or ws://localhost self-hosted URL without embedded credentials.",
  });

export const BrowserLiveKitCredsSchema = z
  .object({
    livekitUrl: LiveKitUrlSchema,
    apiKey: z.string().trim().min(4).max(128),
    apiSecret: z.string().trim().min(8).max(256),
  })
  .strict();

export const DispatchModeSchema = z.enum([
  "cloud-bot",
  "auto",
  "studio-worker",
  "custom",
]);

export const BotSettingsSchema = z
  .object({
    botUrl: z.string().trim().max(256),
    dispatchMode: DispatchModeSchema,
    customAgentName: z
      .string()
      .max(64)
      .regex(/^[A-Za-z0-9_-]*$/),
    sandboxId: z
      .string()
      .trim()
      .max(128)
      .regex(/^[A-Za-z0-9_.-]*$/),
  })
  .strict();

export const ConfigSchema = z
  .object({
    pipeline: z.enum(["stt-llm-tts", "realtime"]),
    stt: z.string().refine((v) => sttIds.has(v), "Unsupported STT model"),
    llm: z.string().refine((v) => llmIds.has(v), "Unsupported LLM model"),
    tts: z.string().refine((v) => ttsIds.has(v), "Unsupported TTS model"),
    voice: z.string().regex(VOICE_ID_RE, "Invalid TTS voice identifier"),
    realtime_model: z
      .string()
      .refine((v) => realtimeIds.has(v), "Unsupported Realtime model"),
    realtime_voice: z
      .string()
      .regex(VOICE_ID_RE, "Invalid Realtime voice identifier"),
    language: z
      .string()
      .refine((v) => languageIds.has(v), "Unsupported language code"),
    turn_detection: z.enum(["turn_detector", "vad", "stt"]),
    noise_cancellation: z.boolean(),
    preemptive_generation: z.boolean(),
    expressive: z.boolean(),
    keyterms: z
      .array(z.string().trim().regex(KEYTERM_RE))
      .max(20),
    instructions: z.string().trim().min(10).max(8000),
  })
  .strict();

export const CloudStatusSchema = z
  .object({
    configured: z.boolean(),
    missing: z.array(z.string()),
    invalid_url: z.boolean(),
    protected: z.boolean(),
    agent_name: z.string(),
    cloud_agent_url: z.string().optional(),
    cloud_project_id: z.string().optional(),
    cloud_agent_id: z.string().optional(),
    dispatch_mode: DispatchModeSchema.optional(),
    sandbox_id: z.string().optional(),
    server_url_hint: z.string().optional(),
    pipelines: z.array(z.enum(["stt-llm-tts", "realtime"])).optional(),
    server_host: z.string().nullable(),
    offline: z.boolean().optional(),
    note: z.string().optional(),
    secret_provider: z.string().optional(),
  })
  .passthrough();

export const SessionMintResponseSchema = z
  .object({
    server_url: LiveKitUrlSchema,
    participant_token: z.string().min(16),
    room_name: z.string().min(1).max(128),
    agent_name: z.string().max(64),
    pipeline: z.enum(["stt-llm-tts", "realtime"]).optional(),
    expires_in: z.number().int().positive().optional(),
  })
  .passthrough();
