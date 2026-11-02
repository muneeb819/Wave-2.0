import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchStudioStatus, postStudioSession } from "../src/api/studioClient";
import {
  mintBrowserLiveKitSession,
  readSessionBrowserCreds,
  saveSessionBrowserCreds,
} from "../src/browserToken";
import {
  BotSettingsSchema,
  BrowserLiveKitCredsSchema,
  ConfigSchema,
  LiveKitUrlSchema,
} from "../src/schemas";
import { defaultBotSettings, defaultConfig } from "../src/types";

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Frontend Zod Runtime Validation Schemas", () => {
  it("accepts valid wss:// and loopback ws:// URLs while rejecting insecure or credentialed URLs", () => {
    expect(
      LiveKitUrlSchema.safeParse("wss://demo-project.livekit.cloud").success,
    ).toBe(true);
    expect(LiveKitUrlSchema.safeParse("ws://localhost:7880").success).toBe(
      true,
    );
    expect(LiveKitUrlSchema.safeParse("ws://127.0.0.1:7880").success).toBe(
      true,
    );

    expect(LiveKitUrlSchema.safeParse("ws://remote.example.com:7880").success).toBe(
      false,
    );
    expect(LiveKitUrlSchema.safeParse("https://demo.livekit.cloud").success).toBe(
      false,
    );
    expect(
      LiveKitUrlSchema.safeParse("wss://user:pass@demo.livekit.cloud").success,
    ).toBe(false);
    expect(
      LiveKitUrlSchema.safeParse("wss://demo.livekit.cloud/bad space").success,
    ).toBe(false);
  });

  it("validates ConfigSchema and BotSettingsSchema against allow-listed catalog models and strict keys", () => {
    expect(ConfigSchema.safeParse(defaultConfig).success).toBe(true);
    expect(BotSettingsSchema.safeParse(defaultBotSettings).success).toBe(true);

    expect(
      ConfigSchema.safeParse({ ...defaultConfig, stt: "unknown/model" }).success,
    ).toBe(false);
    expect(
      ConfigSchema.safeParse({
        ...defaultConfig,
        extraInjectedKey: "forbidden",
      }).success,
    ).toBe(false);
    expect(
      BotSettingsSchema.safeParse({
        ...defaultBotSettings,
        customAgentName: "bad space!",
      }).success,
    ).toBe(false);
  });

  it("rejects tampered sessionStorage credentials and refuses WebCrypto signing on invalid URLs", async () => {
    expect(
      saveSessionBrowserCreds({
        livekitUrl: "http://insecure.example.com",
        apiKey: "APItest123",
        apiSecret: "super-secret-value-123456",
      }),
    ).toBe(false);
    expect(readSessionBrowserCreds()).toBeNull();

    sessionStorage.setItem(
      "inference-studio:session-livekit-creds",
      JSON.stringify({
        livekitUrl: "wss://user:secret@evil.example.com",
        apiKey: "APItest123",
        apiSecret: "super-secret-value-123456",
      }),
    );
    expect(readSessionBrowserCreds()).toBeNull();

    await expect(
      mintBrowserLiveKitSession(
        {
          livekitUrl: "ws://remote.example.com",
          apiKey: "APItest123",
          apiSecret: "super-secret-value-123456",
        },
        defaultConfig,
        "CA_tBWDFVRz7pZS",
      ),
    ).rejects.toThrow();

    expect(
      BrowserLiveKitCredsSchema.safeParse({
        livekitUrl: "wss://valid.livekit.cloud",
        apiKey: "APItest123",
        apiSecret: "super-secret-value-123456",
      }).success,
    ).toBe(true);
  });

  it("rejects malformed /api/status and /api/sessions payloads at the network boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ configured: "not-a-boolean" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
    expect(await fetchStudioStatus()).toEqual({ kind: "offline" });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              server_url: "http://not-websocket.example.com",
              participant_token: "short",
              room_name: "r1",
              agent_name: "a1",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    expect(
      await postStudioSession({
        config: defaultConfig,
        agentName: "my-agent",
        accessToken: "",
      }),
    ).toEqual({
      kind: "error",
      message: "Server returned an invalid session payload.",
    });
  });
});
