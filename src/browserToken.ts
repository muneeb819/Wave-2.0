import type { Config } from "./types";

export const PUBLIC_CHROME_STUDIO_URL =
  "https://raw.githack.com/muneeb819/Wave-2.0/main/docs/index.html?mode=live";

const SESSION_CREDS_KEY = "inference-studio:session-livekit-creds";

export type BrowserLiveKitCreds = {
  livekitUrl: string;
  apiKey: string;
  apiSecret: string;
};

/**
 * Returns a direct standalone URL guaranteed to open in Chrome with full microphone access
 * without triggering E2B's `403 Missing Traffic Access Token` wall on private sandboxes.
 */
export function getStandaloneChromeUrl(): string {
  if (typeof window === "undefined") return PUBLIC_CHROME_STUDIO_URL;
  const host = window.location.hostname;
  if (host.endsWith(".e2b.app") || host.endsWith(".e2b.dev")) {
    return PUBLIC_CHROME_STUDIO_URL;
  }
  return `${window.location.origin}${window.location.pathname}?mode=live`;
}

export function readSessionBrowserCreds(): BrowserLiveKitCreds | null {
  try {
    const raw = sessionStorage.getItem(SESSION_CREDS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.livekitUrl === "string" &&
      typeof parsed.apiKey === "string" &&
      typeof parsed.apiSecret === "string" &&
      parsed.livekitUrl &&
      parsed.apiKey &&
      parsed.apiSecret
    ) {
      return parsed as BrowserLiveKitCreds;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveSessionBrowserCreds(creds: BrowserLiveKitCreds): void {
  try {
    sessionStorage.setItem(SESSION_CREDS_KEY, JSON.stringify(creds));
  } catch {
    /* sessionStorage unavailable */
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function utf8Bytes(input: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(input);
  const copy = new Uint8Array(encoded.byteLength);
  copy.set(encoded);
  return copy;
}

/**
 * Mint a short-lived (10-minute), room-scoped LiveKit HS256 participant token directly
 * in browser memory via WebCrypto (`crypto.subtle`) when running serverless on HTTPS
 * (e.g. `https://muneeb819.github.io/Wave-2.0/?mode=live`).
 */
export async function mintBrowserLiveKitSession(
  creds: BrowserLiveKitCreds,
  config: Config,
  agentName: string,
): Promise<{
  server_url: string;
  participant_token: string;
  room_name: string;
  agent_name: string;
}> {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  const roomName = `inference-${suffix}`;
  const identity = `user-${suffix}`;
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "HS256", typ: "JWT" };
  // Mirror the claim set produced by `livekit.api.AccessToken`: `iat`/`jti` are present
  // so browser-minted tokens are indistinguishable from server-minted ones.
  const payload = {
    iss: creds.apiKey.trim(),
    sub: identity,
    name: "You",
    jti: crypto.randomUUID(),
    iat: now,
    nbf: now - 5,
    exp: now + 600,
    video: {
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      canPublishSources: ["microphone"],
      canUpdateOwnMetadata: false,
    },
    roomConfig: {
      name: roomName,
      emptyTimeout: 60,
      departureTimeout: 20,
      maxParticipants: 2,
      agents: agentName
        ? [{ agentName, metadata: JSON.stringify(config) }]
        : [],
    },
  };

  const encodedHeader = toBase64Url(utf8Bytes(JSON.stringify(header)));
  const encodedPayload = toBase64Url(utf8Bytes(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    utf8Bytes(creds.apiSecret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    utf8Bytes(signingInput),
  );
  const jwt = `${signingInput}.${toBase64Url(new Uint8Array(signature))}`;

  return {
    server_url: creds.livekitUrl.trim(),
    participant_token: jwt,
    room_name: roomName,
    agent_name: agentName,
  };
}
