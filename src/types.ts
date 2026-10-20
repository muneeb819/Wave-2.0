import catalog from "../shared/models.json";

export { catalog };
export type ModelKind = "stt" | "llm" | "tts";
export type SessionMode = "demo" | "live";
export type AgentState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "reconnecting"
  | "ended";
export type Config = typeof catalog.defaults;
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
  server_host: string | null;
  offline?: boolean;
};

export const emptyMetrics: Metrics = {
  transcription_ms: null,
  endpointing_ms: null,
  llm_ms: null,
  tts_ms: null,
  tokens: null,
};
export const getModel = (kind: ModelKind, id: string): Model =>
  catalog[kind].find((model) => model.id === id) ?? catalog[kind][0];
export const formatTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
export const uid = () => crypto.randomUUID();

export const CONFIG_STORAGE_KEY = "inference-studio:config";
export const STT_PRESET_KEY = "inference-studio:stt-preset";
const STT_PRESET = "xai-stt-1:en:v1";

export function readConfig(): Config {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || "{}");
    const config: Config = { ...catalog.defaults };
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      // Keep only supported fields; never forward arbitrary stored properties to the API.
      for (const key of Object.keys(catalog.defaults) as (keyof Config)[]) {
        if (typeof saved[key] === "string") config[key] = saved[key];
      }
    }
    // Apply the requested STT change once to existing Nova/Flux configurations.
    // Other models, voice, and instructions are preserved. Later user choices persist.
    if (localStorage.getItem(STT_PRESET_KEY) !== STT_PRESET) {
      config.stt = catalog.defaults.stt;
      config.language = "en";
    }
    for (const kind of ["stt", "llm", "tts"] as const) {
      if (!catalog[kind].some((model) => model.id === config[kind]))
        config[kind] = catalog.defaults[kind];
    }
    if (!getModel("stt", config.stt).languages?.includes(config.language))
      config.language = "en";
    if (
      typeof config.instructions !== "string" ||
      config.instructions.length < 10 ||
      config.instructions.length > 8000
    )
      config.instructions = catalog.defaults.instructions;
    if (
      typeof config.voice !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(config.voice)
    )
      config.voice = catalog.defaults.voice;
    return config;
  } catch {
    return { ...catalog.defaults };
  }
}

export function saveConfig(config: Config) {
  try {
    localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    localStorage.setItem(STT_PRESET_KEY, STT_PRESET);
  } catch {
    // Private browsing may block storage; the current in-memory settings still work.
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
