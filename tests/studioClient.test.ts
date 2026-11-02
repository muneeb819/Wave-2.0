import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchStudioStatus,
  postStudioCredentials,
  postStudioSession,
} from "../src/api/studioClient";
import { defaultConfig } from "../src/types";

describe("studioClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles non-404 status failures and invalid Zod payloads gracefully", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("err", { status: 502 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ configured: "not-boolean" }), {
          status: 200,
        }),
      );

    expect(await fetchStudioStatus()).toEqual({ kind: "offline" });
    expect(await fetchStudioStatus()).toEqual({ kind: "offline" });
  });

  it("handles static fallback and structured error messages in postStudioCredentials and postStudioSession", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 405 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "Invalid URL" }), { status: 422 }),
      )
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ bad: true }), { status: 200 }),
      );

    const credFallback = await postStudioCredentials({
      livekitUrl: "wss://x.livekit.cloud",
      apiKey: "key1",
      apiSecret: "secret-12345678",
      agentUrl: "",
      agentName: "",
      accessToken: "tok",
    });
    expect(credFallback).toEqual({ kind: "static_fallback" });

    const credErr = await postStudioCredentials({
      livekitUrl: "wss://x.livekit.cloud",
      apiKey: "key1",
      apiSecret: "secret-12345678",
      agentUrl: "",
      agentName: "",
      accessToken: "",
    });
    expect(credErr).toEqual({ kind: "error", message: "Invalid URL" });

    const sessFallback = await postStudioSession({
      config: defaultConfig,
      agentName: "",
      accessToken: "tok",
    });
    expect(sessFallback).toEqual({ kind: "static_fallback" });

    const sessBadShape = await postStudioSession({
      config: defaultConfig,
      agentName: "",
      accessToken: "",
    });
    expect(sessBadShape.kind).toBe("error");
  });
});
