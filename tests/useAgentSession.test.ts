import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultBotSettings, defaultConfig } from "../src/types";
import type { LiveRoomBridgeContext } from "../src/session/liveRoomBridge";

const { mockConnectLiveRoom } = vi.hoisted(() => ({
  mockConnectLiveRoom: vi.fn(),
}));

vi.mock("../src/session/liveRoomBridge", () => ({
  connectLiveRoom: (...args: unknown[]) => mockConnectLiveRoom(...args),
}));

import { useAgentSession } from "../src/useAgentSession";

describe("useAgentSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    mockConnectLiveRoom.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("transitions idle -> connecting -> speaking -> listening -> ended in demo mode and records history", async () => {
    const { result } = renderHook(() =>
      useAgentSession(defaultConfig, defaultBotSettings),
    );
    expect(result.current.state).toBe("idle");
    expect(result.current.active).toBe(false);

    await act(async () => {
      await result.current.start("demo");
    });
    expect(result.current.state).toBe("connecting");
    expect(result.current.active).toBe(true);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current.state).toBe("speaking");
    expect(result.current.messages).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.state).toBe("listening");

    let sent = false;
    await act(async () => {
      sent = await result.current.sendText("How does turn detection work?");
    });
    expect(sent).toBe(true);
    expect(result.current.state).toBe("thinking");

    act(() => {
      vi.advanceTimersByTime(2200);
    });
    expect(result.current.state).toBe("listening");
    expect(result.current.messages).toHaveLength(3);

    act(() => {
      result.current.stop();
    });
    expect(result.current.state).toBe("ended");
    expect(result.current.history).toHaveLength(1);

    const historyId = result.current.history[0].id;
    act(() => {
      result.current.deleteHistory(historyId);
    });
    expect(result.current.history).toHaveLength(0);
  });

  it("manages live Room mute, text chat, audio unlock, and message length limits", async () => {
    const fakeRoom = {
      disconnect: vi.fn(async () => undefined),
      startAudio: vi.fn(async () => undefined),
      localParticipant: {
        isMicrophoneEnabled: true,
        setMicrophoneEnabled: vi.fn(async () => undefined),
        sendText: vi.fn(async () => undefined),
      },
    };

    mockConnectLiveRoom.mockImplementationOnce(
      async (ctx: LiveRoomBridgeContext) => {
        ctx.roomRef.current = fakeRoom as never;
        ctx.connectedRef.current = true;
        ctx.setNeedsAudio(true);
        ctx.setState("listening");
      },
    );

    const { result } = renderHook(() =>
      useAgentSession(defaultConfig, defaultBotSettings),
    );
    await act(async () => {
      await result.current.start("live", "studio-token");
    });
    expect(result.current.state).toBe("listening");
    expect(result.current.needsAudio).toBe(true);

    await act(async () => {
      await result.current.enableAudio();
    });
    expect(result.current.needsAudio).toBe(false);

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(fakeRoom.localParticipant.setMicrophoneEnabled).toHaveBeenCalledWith(
      false,
    );
    expect(result.current.muted).toBe(true);

    let tooLong = true;
    await act(async () => {
      tooLong = await result.current.sendText("x".repeat(2001));
    });
    expect(tooLong).toBe(false);
    expect(result.current.error).toMatch(/2,000/);

    act(() => {
      result.current.clearError();
    });
    expect(result.current.error).toBe("");

    let sentLive = false;
    await act(async () => {
      sentLive = await result.current.sendText("Hello live agent");
    });
    expect(sentLive).toBe(true);
    expect(fakeRoom.localParticipant.sendText).toHaveBeenCalledWith(
      "Hello live agent",
      { topic: "lk.chat" },
    );

    act(() => {
      result.current.stop();
    });
    expect(result.current.state).toBe("ended");
    expect(fakeRoom.disconnect).toHaveBeenCalled();
  });

  it("captures connection errors and transitions cleanly to ended", async () => {
    mockConnectLiveRoom.mockRejectedValueOnce(
      new Error("Invalid LiveKit credentials"),
    );
    const { result } = renderHook(() =>
      useAgentSession(defaultConfig, defaultBotSettings),
    );
    await act(async () => {
      await result.current.start("live");
    });
    expect(result.current.state).toBe("ended");
    expect(result.current.error).toBe("Invalid LiveKit credentials");
  });
});
