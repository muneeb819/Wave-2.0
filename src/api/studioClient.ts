import {
  DEFAULT_CLOUD_AGENT_ID,
  DEFAULT_CLOUD_AGENT_URL,
  DEFAULT_CLOUD_PROJECT_ID,
  DEFAULT_CLOUD_URL_HINT,
} from "../types";
import type { BotSettings, CloudStatus, Config } from "../types";

export const initialCloudStatus: CloudStatus = {
  configured: false,
  missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
  protected: false,
  invalid_url: false,
  agent_name: DEFAULT_CLOUD_AGENT_ID,
  cloud_agent_url: DEFAULT_CLOUD_AGENT_URL,
  cloud_project_id: DEFAULT_CLOUD_PROJECT_ID,
  cloud_agent_id: DEFAULT_CLOUD_AGENT_ID,
  server_url_hint: DEFAULT_CLOUD_URL_HINT,
  server_host: null,
};

export type StatusFetchResult =
  | { kind: "ok"; status: CloudStatus }
  | { kind: "static_404" }
  | { kind: "offline" };

export async function fetchStudioStatus(): Promise<StatusFetchResult> {
  try {
    const response = await fetch("/api/status");
    if (!response.ok) {
      if (response.status === 404) {
        return { kind: "static_404" };
      }
      return { kind: "offline" };
    }
    const payload = (await response.json()) as CloudStatus;
    return { kind: "ok", status: payload };
  } catch {
    return { kind: "offline" };
  }
}

export async function syncStudioBotSettings(
  botSettings: BotSettings,
  accessToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await fetch("/api/bot-settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({
      agent_url: botSettings.botUrl,
      dispatch_mode: botSettings.dispatchMode,
      custom_agent_name: botSettings.customAgentName,
      sandbox_id: botSettings.sandboxId,
    }),
    signal,
  });
}

export type SaveCredentialsResult =
  | { kind: "saved"; status: CloudStatus }
  | { kind: "static_fallback" }
  | { kind: "error"; message: string };

export async function postStudioCredentials(params: {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
  agentUrl: string;
  agentName: string;
  accessToken: string;
}): Promise<SaveCredentialsResult> {
  try {
    const response = await fetch("/api/credentials", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.accessToken
          ? { Authorization: `Bearer ${params.accessToken}` }
          : {}),
      },
      body: JSON.stringify({
        livekit_url: params.livekitUrl,
        api_key: params.apiKey,
        api_secret: params.apiSecret,
        agent_url: params.agentUrl,
        agent_name: params.agentName,
      }),
    });
    if (response.ok) {
      const payload = (await response.json()) as CloudStatus;
      return { kind: "saved", status: payload };
    }
    if (response.status === 404 || response.status === 405) {
      return { kind: "static_fallback" };
    }
    const payload = await response.json();
    const message =
      typeof payload.detail === "string"
        ? payload.detail
        : payload.detail?.message || "Could not save credentials.";
    return { kind: "error", message };
  } catch {
    return { kind: "static_fallback" };
  }
}

export type SessionMintResponse = {
  server_url: string;
  participant_token: string;
  room_name: string;
  agent_name: string;
};

export type SessionMintResult =
  | { kind: "ok"; data: SessionMintResponse }
  | { kind: "static_fallback" }
  | { kind: "error"; message: string };

export async function postStudioSession(params: {
  config: Config;
  agentName: string;
  accessToken: string;
  signal?: AbortSignal;
}): Promise<SessionMintResult> {
  const response = await fetch("/api/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(params.accessToken
        ? { Authorization: `Bearer ${params.accessToken}` }
        : {}),
    },
    body: JSON.stringify({
      config: params.config,
      agent_name: params.agentName,
    }),
    signal: params.signal,
  });
  if (response.ok) {
    const data = (await response.json()) as SessionMintResponse;
    return { kind: "ok", data };
  }
  if (response.status === 404 || response.status === 405) {
    return { kind: "static_fallback" };
  }
  const data = await response.json();
  const message =
    typeof data.detail === "string"
      ? data.detail
      : data.detail?.message ||
        "The token service is unavailable. Start the Python API.";
  return { kind: "error", message };
}
