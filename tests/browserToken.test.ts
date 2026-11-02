import { beforeEach, describe, expect, it } from "vitest";
import {
  PUBLIC_CHROME_STUDIO_URL,
  getStandaloneChromeUrl,
  mintBrowserLiveKitSession,
  readSessionBrowserCreds,
  saveSessionBrowserCreds,
} from "../src/browserToken";
import { defaultConfig } from "../src/types";

describe("browserToken", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("rejects malformed credentials and round-trips valid sessionStorage credentials", () => {
    expect(readSessionBrowserCreds()).toBeNull();
    sessionStorage.setItem(
      "inference-studio:session-livekit-creds",
      "{not-json",
    );
    expect(readSessionBrowserCreds()).toBeNull();

    expect(
      saveSessionBrowserCreds({
        livekitUrl: "http://insecure.example.com",
        apiKey: "x",
        apiSecret: "short",
      }),
    ).toBe(false);

    expect(
      saveSessionBrowserCreds({
        livekitUrl: "wss://wave.livekit.cloud",
        apiKey: "APIwave123",
        apiSecret: "0123456789abcdef0123456789abcdef",
      }),
    ).toBe(true);
    expect(readSessionBrowserCreds()?.apiKey).toBe("APIwave123");
  });

  it("builds standalone URLs and mints automatic-dispatch tokens when agentName is empty", async () => {
    expect(getStandaloneChromeUrl()).toContain("?mode=live");
    expect(PUBLIC_CHROME_STUDIO_URL).toMatch(/^https:\/\//);

    const session = await mintBrowserLiveKitSession(
      {
        livekitUrl: "wss://wave.livekit.cloud",
        apiKey: "APIwave123",
        apiSecret: "0123456789abcdef0123456789abcdef",
      },
      defaultConfig,
      "",
    );
    expect(session.agent_name).toBe("");
    expect(session.participant_token.split(".")).toHaveLength(3);
  });
});
