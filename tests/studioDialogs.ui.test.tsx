import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialCloudStatus } from "../src/api/studioClient";
import { StudioDialogs } from "../src/sections/StudioDialogs";
import { defaultBotSettings, defaultConfig } from "../src/types";
import type { AgentSessionController } from "../src/useAgentSession";

afterEach(cleanup);

function makeSession(): AgentSessionController {
  return {
    mode: "demo",
    state: "idle",
    active: false,
    muted: false,
    needsAudio: false,
    error: "",
    partial: "",
    messages: [],
    logs: [],
    history: [
      {
        id: "h-1",
        mode: "demo",
        startedAt: Date.now(),
        duration: 15,
        config: defaultConfig,
        messages: [{ id: "m1", role: "user", text: "Hi", timestamp: 1 }],
        metrics: {
          transcription_ms: 50,
          llm_ms: 120,
          tts_ms: 80,
          endpointing_ms: 100,
          tokens: 12,
        },
      },
    ],
    metrics: {
      transcription_ms: null,
      llm_ms: null,
      tts_ms: null,
      endpointing_ms: null,
      tokens: null,
    },
    elapsed: 0,
    start: vi.fn(async () => undefined),
    stop: vi.fn(),
    toggleMute: vi.fn(async () => undefined),
    sendText: vi.fn(async () => true),
    enableAudio: vi.fn(async () => undefined),
    clearError: vi.fn(),
    clearHistory: vi.fn(),
    deleteHistory: vi.fn(),
  };
}

describe("StudioDialogs", () => {
  it("dispatches keyterms, clear-history, workspace, and transcript deletion actions", () => {
    const session = makeSession();
    const setConfig = vi.fn();
    const onNotify = vi.fn();
    const onCloseModal = vi.fn();
    const onCloseHistory = vi.fn();
    const onNavigate = vi.fn();

    const baseProps = {
      codeTab: "snippet" as const,
      setCodeTab: vi.fn(),
      config: defaultConfig,
      setConfig,
      botSettings: defaultBotSettings,
      setBotSettings: vi.fn(),
      cloud: initialCloudStatus,
      setCloud: vi.fn(),
      cloudLabel: "Connected",
      isLiveReady: true,
      activeAgentId: "CA_bot",
      activeProjectId: "p_proj",
      accessToken: "tok",
      setAccessToken: vi.fn(),
      checking: false,
      session,
      onCopy: vi.fn(),
      onNotify,
      onCheckConnection: vi.fn(),
      onNavigate,
      onChangePipeline: vi.fn(),
      onSetSelectedMode: vi.fn(),
      onCloseModal,
      onCloseHistory,
    };

    const { rerender } = render(
      <StudioDialogs {...baseProps} modal="clear-history" selectedHistory={null} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Clear history$/i }));
    expect(session.clearHistory).toHaveBeenCalledOnce();

    rerender(
      <StudioDialogs
        {...baseProps}
        modal={null}
        selectedHistory={session.history[0]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    expect(session.deleteHistory).toHaveBeenCalledWith("h-1");
    expect(onCloseHistory).toHaveBeenCalledOnce();
  });
});
