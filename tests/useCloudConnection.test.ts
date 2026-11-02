import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { initialCloudStatus } from "../src/api/studioClient";
import { defaultBotSettings } from "../src/types";

const {
  mockFetchStudioStatus,
  mockSyncStudioBotSettings,
  mockReadSessionBrowserCreds,
} = vi.hoisted(() => ({
  mockFetchStudioStatus: vi.fn(),
  mockSyncStudioBotSettings: vi.fn(async () => undefined),
  mockReadSessionBrowserCreds: vi.fn(),
}));

vi.mock("../src/api/studioClient", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/api/studioClient")>();
  return {
    ...actual,
    fetchStudioStatus: () => mockFetchStudioStatus(),
    syncStudioBotSettings: (...args: unknown[]) =>
      mockSyncStudioBotSettings(...args),
  };
});

vi.mock("../src/browserToken", () => ({
  readSessionBrowserCreds: () => mockReadSessionBrowserCreds(),
}));

import { useCloudConnection } from "../src/hooks/useCloudConnection";

describe("useCloudConnection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it("handles static_404 mode with session browser credentials and switches to live", async () => {
    mockFetchStudioStatus.mockResolvedValue({ kind: "static_404" });
    mockReadSessionBrowserCreds.mockReturnValue({
      livekitUrl: "wss://tab.livekit.cloud",
      apiKey: "APItab",
      apiSecret: "secret-32-chars-minimum-0123456789",
    });
    const setSelectedMode = vi.fn();
    const setBotSettings = vi.fn();
    const notify = vi.fn();
    const { result } = renderHook(() =>
      useCloudConnection({
        botSettings: defaultBotSettings,
        setBotSettings,
        accessToken: "",
        activeAgentId: "CA_bot",
        setSelectedMode,
        notify,
      }),
    );

    await act(async () => {
      await result.current.checkConnection(false);
    });
    expect(result.current.cloud.configured).toBe(true);
    expect(setSelectedMode).toHaveBeenCalledWith("live");
  });

  it("surfaces offline and configured notifications on manual checkConnection", async () => {
    mockFetchStudioStatus.mockResolvedValueOnce({ kind: "offline" });
    const notify = vi.fn();
    const setSelectedMode = vi.fn();
    const setBotSettings = vi.fn();

    const { result } = renderHook(() =>
      useCloudConnection({
        botSettings: defaultBotSettings,
        setBotSettings,
        accessToken: "tok",
        activeAgentId: "CA_bot",
        setSelectedMode,
        notify,
      }),
    );

    await act(async () => {
      await Promise.resolve();
    });

    mockFetchStudioStatus.mockResolvedValueOnce({ kind: "offline" });
    await act(async () => {
      await result.current.checkConnection(true);
    });
    expect(notify).toHaveBeenCalledWith(expect.stringMatching(/API offline/i));

    mockFetchStudioStatus.mockResolvedValueOnce({
      kind: "ok",
      status: {
        ...initialCloudStatus,
        configured: true,
        server_host: "wave.livekit.cloud",
        cloud_agent_url:
          "https://cloud.livekit.io/projects/p_1/agents/CA_2",
        dispatch_mode: "cloud-bot",
        sandbox_id: "sbx-1",
      },
    });
    await act(async () => {
      await result.current.checkConnection(true);
    });
    expect(notify).toHaveBeenCalledWith(
      expect.stringMatching(/Connected to wave\.livekit\.cloud/),
    );
    expect(setBotSettings).toHaveBeenCalled();
  });
});
