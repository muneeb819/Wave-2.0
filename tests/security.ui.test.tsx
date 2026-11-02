import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  postStudioCredentials,
  postStudioSession,
} from "../src/api/studioClient";
import { readSessionBrowserCreds } from "../src/browserToken";
import { isValidLiveKitUrl } from "../src/schemas";
import { HISTORY_STORAGE_KEY, loadHistory } from "../src/session/demoSimulator";
import { defaultConfig, readBotSettings, readConfig } from "../src/types";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Frontend Security Boundaries & Storage Sanitization", () => {
  it("drops tampered or schema-invalid history entries from sessionStorage", () => {
    sessionStorage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify([
        {
          id: "valid-12345678",
          mode: "demo",
          startedAt: Date.now(),
          duration: 12,
          config: defaultConfig,
          messages: [
            { id: "m1", role: "assistant", text: "Safe", timestamp: Date.now() },
          ],
          metrics: {
            transcription_ms: 10,
            endpointing_ms: 20,
            llm_ms: 30,
            tts_ms: 40,
            tokens: 5,
          },
        },
        {
          id: "corrupt-entry",
          mode: "evil-mode",
          messages: "not-an-array",
        },
      ]),
    );

    const loaded = loadHistory();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("valid-12345678");
  });

  it("sanitizes malicious model IDs, voice IDs, and agent dispatch names in localStorage", () => {
    localStorage.setItem(
      "inference-studio:config",
      JSON.stringify({
        stt: "../../etc/passwd",
        llm: "evil/unlisted-model",
        voice: "bad voice\r\ninjection",
        keyterms: ["ValidTerm", "<script>alert(1)</script>"],
        instructions: "short",
      }),
    );
    const cfg = readConfig();
    expect(cfg.stt).toBe(defaultConfig.stt);
    expect(cfg.llm).toBe(defaultConfig.llm);
    expect(cfg.voice).toBe(defaultConfig.voice);
    expect(cfg.keyterms).toEqual(["ValidTerm"]);
    expect(cfg.instructions).toBe(defaultConfig.instructions);

    localStorage.setItem(
      "inference-studio:bot",
      JSON.stringify({
        dispatchMode: "custom",
        customAgentName: "agent; rm -rf /",
        sandboxId: "sandbox\nheader-inject",
      }),
    );
    const bot = readBotSettings();
    expect(bot.customAgentName).toBe("");
    expect(bot.sandboxId).toBe("");
  });

  it("rejects plaintext remote URLs and embedded credentials in LiveKit URLs and browser creds", () => {
    expect(isValidLiveKitUrl("ws://remote.livekit.cloud")).toBe(false);
    expect(isValidLiveKitUrl("http://remote.livekit.cloud")).toBe(false);
    expect(isValidLiveKitUrl("wss://admin:secret@remote.livekit.cloud")).toBe(
      false,
    );
    expect(isValidLiveKitUrl("ws://127.0.0.1:7880")).toBe(true);

    sessionStorage.setItem(
      "inference-studio:session-livekit-creds",
      JSON.stringify({
        livekitUrl: "ws://insecure-remote.example.com",
        apiKey: "APIkey123",
        apiSecret: "secret-value-at-least-8",
      }),
    );
    expect(readSessionBrowserCreds()).toBeNull();
  });

  it("handles 401/403 security errors and rejects tampered /api/sessions payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: {
              code: "token_required",
              message: "Enter the studio access token.",
            },
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const unauth = await postStudioSession({
      config: defaultConfig,
      agentName: "CA_test",
      accessToken: "",
    });
    expect(unauth).toEqual({
      kind: "error",
      message: "Enter the studio access token.",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            server_url: "ws://tampered-remote.example.com",
            participant_token: "short",
            room_name: "r1",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const tampered = await postStudioSession({
      config: defaultConfig,
      agentName: "CA_test",
      accessToken: "tok",
    });
    expect(tampered).toEqual({
      kind: "error",
      message: "Server returned an invalid session payload.",
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            detail: {
              code: "forbidden_origin",
              message: "Cross-origin requests are not allowed.",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const forbidden = await postStudioCredentials({
      livekitUrl: "wss://a.livekit.cloud",
      apiKey: "APIkey123",
      apiSecret: "secret-value-12345678",
      agentUrl: "https://cloud.livekit.io/projects/p_1/agents/CA_1",
      dispatchMode: "cloud-bot",
      customAgentName: "",
      sandboxId: "",
      accessToken: "",
    });
    expect(forbidden).toEqual({
      kind: "error",
      message: "Cross-origin requests are not allowed.",
    });
  });
});
