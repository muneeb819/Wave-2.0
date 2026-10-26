import catalog from "../shared/models.json";

export { catalog };
export type PipelineType = "stt-llm-tts" | "realtime";
export type TurnDetectionMode = "turn_detector" | "vad" | "stt";
export type ModelKind = "stt" | "llm" | "tts";
export type AnyModelKind = ModelKind | "realtime";
export type SdkKind = "python" | "node";
export type SessionMode = "demo" | "live";
export type DispatchMode = "cloud-bot" | "auto" | "studio-worker" | "custom";
export type AgentState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "ended";

export const DEFAULT_CLOUD_AGENT_URL =
  "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS";
export const DEFAULT_CLOUD_PROJECT_ID = "p_jg0goo2oksb";
export const DEFAULT_CLOUD_AGENT_ID = "CA_tBWDFVRz7pZS";
export const DEFAULT_CLOUD_URL_HINT = "wss://medicare-bot-z2uz9h17.livekit.cloud";

export type BotSettings = {
  botUrl: string;
  dispatchMode: DispatchMode;
  customAgentName: string;
  sandboxId: string;
};

export type Config = {
  pipeline: PipelineType;
  stt: string;
  llm: string;
  tts: string;
  voice: string;
  realtime_model: string;
  realtime_voice: string;
  language: string;
  turn_detection: TurnDetectionMode;
  noise_cancellation: boolean;
  preemptive_generation: boolean;
  expressive: boolean;
  keyterms: string[];
  instructions: string;
};

export type Model = {
  id: string;
  provider: string;
  name: string;
  mark: string;
  note: string;
  tag: string;
  languages?: string[];
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  pending?: boolean;
  interrupted?: boolean;
};

export type Metrics = {
  transcription_ms: number | null;
  endpointing_ms: number | null;
  llm_ms: number | null;
  tts_ms: number | null;
  tokens: number | null;
};

export type EventLog = {
  id: string;
  timestamp: number;
  message: string;
  kind: "info" | "success" | "warning" | "error";
};

export type HistoryEntry = {
  id: string;
  mode: SessionMode;
  startedAt: number;
  duration: number;
  config: Config;
  messages: Message[];
  metrics: Metrics;
};

export type CloudStatus = {
  configured: boolean;
  missing: string[];
  invalid_url: boolean;
  protected: boolean;
  agent_name: string;
  cloud_agent_url?: string;
  cloud_project_id?: string;
  cloud_agent_id?: string;
  dispatch_mode?: DispatchMode;
  sandbox_id?: string;
  server_url_hint?: string;
  pipelines?: PipelineType[];
  server_host: string | null;
  offline?: boolean;
};

export const defaultBotSettings: BotSettings = {
  botUrl: DEFAULT_CLOUD_AGENT_URL,
  dispatchMode: "cloud-bot",
  customAgentName: "",
  sandboxId: "",
};

export function parseCloudAgentUrl(raw: string): {
  projectId: string | null;
  agentId: string | null;
} {
  const trimmed = raw.trim();
  const match = trimmed.match(
    /^https?:\/\/cloud\.livekit\.io\/projects\/(p_[A-Za-z0-9_-]+)\/agents\/(CA_[A-Za-z0-9_-]+)\/?$/,
  );
  if (match) return { projectId: match[1], agentId: match[2] };
  if (/^CA_[A-Za-z0-9_-]+$/.test(trimmed)) {
    return { projectId: null, agentId: trimmed };
  }
  return { projectId: null, agentId: null };
}

export function resolveDispatchAgentName(bot: BotSettings): string {
  const parsed = parseCloudAgentUrl(bot.botUrl);
  if (bot.dispatchMode === "cloud-bot") {
    return parsed.agentId || DEFAULT_CLOUD_AGENT_ID;
  }
  if (bot.dispatchMode === "auto") return "";
  if (bot.dispatchMode === "studio-worker") return "inference-studio";
  return bot.customAgentName.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

export const defaultConfig: Config = {
  ...(catalog.defaults as Config),
  keyterms: [...catalog.defaults.keyterms],
};

export const emptyMetrics: Metrics = {
  transcription_ms: null,
  endpointing_ms: null,
  llm_ms: null,
  tts_ms: null,
  tokens: null,
};

export const getModel = (kind: AnyModelKind, id: string): Model =>
  catalog[kind].find((model) => model.id === id) ?? catalog[kind][0];

export const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export const uid = () => crypto.randomUUID();

export const CONFIG_STORAGE_KEY = "inference-studio:config";
export const BOT_STORAGE_KEY = "inference-studio:bot";
export const STT_PRESET_KEY = "inference-studio:stt-preset";
export const CURRENT_PRESET = "wave2-quickstart-u36pro:v2";

export function readBotSettings(): BotSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(BOT_STORAGE_KEY) || "{}");
    const next: BotSettings = { ...defaultBotSettings };
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      if (typeof saved.botUrl === "string" && saved.botUrl.trim()) {
        next.botUrl = saved.botUrl.trim();
      }
      if (
        saved.dispatchMode === "cloud-bot" ||
        saved.dispatchMode === "auto" ||
        saved.dispatchMode === "studio-worker" ||
        saved.dispatchMode === "custom"
      ) {
        next.dispatchMode = saved.dispatchMode;
      }
      if (typeof saved.customAgentName === "string") {
        next.customAgentName = saved.customAgentName;
      }
      if (typeof saved.sandboxId === "string") {
        next.sandboxId = saved.sandboxId.trim();
      }
    }
    return next;
  } catch {
    return { ...defaultBotSettings };
  }
}

export function saveBotSettings(settings: BotSettings) {
  try {
    localStorage.setItem(BOT_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing may block storage; in-memory settings still work.
  }
}

export function readConfig(): Config {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
    const config: Config = {
      ...defaultConfig,
      keyterms: [...defaultConfig.keyterms],
    };

    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      if (saved.pipeline === "stt-llm-tts" || saved.pipeline === "realtime") {
        config.pipeline = saved.pipeline;
      }
      for (const key of [
        "stt",
        "llm",
        "tts",
        "voice",
        "realtime_model",
        "realtime_voice",
        "language",
        "instructions",
      ] as const) {
        if (typeof saved[key] === "string") config[key] = saved[key];
      }
      if (
        saved.turn_detection === "turn_detector" ||
        saved.turn_detection === "vad" ||
        saved.turn_detection === "stt"
      ) {
        config.turn_detection = saved.turn_detection;
      }
      for (const boolKey of [
        "noise_cancellation",
        "preemptive_generation",
        "expressive",
      ] as const) {
        if (typeof saved[boolKey] === "boolean") {
          config[boolKey] = saved[boolKey];
        }
      }
      if (Array.isArray(saved.keyterms)) {
        const cleaned = saved.keyterms
          .filter((item: unknown): item is string => typeof item === "string")
          .map((item: string) => item.trim())
          .filter((item: string) =>
            /^[A-Za-z0-9][A-Za-z0-9 .,'&/_-]{0,63}$/.test(item),
          )
          .slice(0, 20);
        config.keyterms = cleaned;
      }
    }

    // Migrate legacy pre-Wave-2.0 STT defaults once while preserving user customizations.
    if (localStorage.getItem(STT_PRESET_KEY) !== CURRENT_PRESET) {
      config.stt = defaultConfig.stt;
      config.language = "en";
    }

    for (const kind of ["stt", "llm", "tts"] as const) {
      if (!catalog[kind].some((model) => model.id === config[kind])) {
        config[kind] = defaultConfig[kind];
      }
    }
    if (
      !catalog.realtime.some((model) => model.id === config.realtime_model)
    ) {
      config.realtime_model = defaultConfig.realtime_model;
    }
    if (!getModel("stt", config.stt).languages?.includes(config.language)) {
      config.language = "en";
    }
    if (
      typeof config.instructions !== "string" ||
      config.instructions.length < 10 ||
      config.instructions.length > 8000
    ) {
      config.instructions = defaultConfig.instructions;
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(config.voice)) {
      config.voice = defaultConfig.voice;
    }
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(config.realtime_voice)) {
      config.realtime_voice = defaultConfig.realtime_voice;
    }
    return config;
  } catch {
    return { ...defaultConfig, keyterms: [...defaultConfig.keyterms] };
  }
}

export function saveConfig(config: Config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(STT_PRESET_KEY, CURRENT_PRESET);
  } catch {
    // Private browsing may block storage; in-memory settings still work.
  }
}

export function downloadJSON(name: string, value: unknown) {
  downloadText(name, JSON.stringify(value, null, 2), "application/json");
}

export function downloadText(
  name: string,
  content: string,
  type = "text/plain",
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function copyText(text: string) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const input = document.createElement("textarea");
  input.value = text;
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied)
    throw new Error(
      "Clipboard is unavailable. Please select and copy the code.",
    );
}
