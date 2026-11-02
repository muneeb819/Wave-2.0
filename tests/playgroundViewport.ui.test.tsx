import "@testing-library/jest-dom/vitest";
import { createRef } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundViewport } from "../src/sections/PlaygroundViewport";
import type { AgentSessionController } from "../src/useAgentSession";

afterEach(cleanup);

function makeSession(
  overrides: Partial<AgentSessionController> = {},
): AgentSessionController {
  return {
    mode: "live",
    state: "idle",
    active: false,
    muted: false,
    needsAudio: false,
    error: null,
    roomName: "",
    partial: "",
    messages: [],
    logs: [],
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
    ...overrides,
  };
}

describe("PlaygroundViewport", () => {
  it("renders connecting state and empty events placeholder", () => {
    const onStart = vi.fn();
    const { rerender } = render(
      <PlaygroundViewport
        tab="conversation"
        session={makeSession({ state: "connecting", active: true })}
        selectedMode="live"
        stage="Connecting your agent"
        scrollRef={createRef()}
        onStart={onStart}
      />,
    );
    expect(screen.getByText(/Connecting your voice stack/i)).toBeInTheDocument();

    rerender(
      <PlaygroundViewport
        tab="events"
        session={makeSession()}
        selectedMode="demo"
        stage="Ready when you are"
        scrollRef={createRef()}
        onStart={onStart}
      />,
    );
    expect(screen.getByText(/Every step, in real time/i)).toBeInTheDocument();
  });

  it("renders interrupted turns, interim captions, audio unlock, and error dismissal", () => {
    const enableAudio = vi.fn(async () => undefined);
    const clearError = vi.fn();
    const session = makeSession({
      active: true,
      state: "thinking",
      needsAudio: true,
      partial: "testing microphone",
      error: "Agent dispatch timed out",
      enableAudio,
      clearError,
      messages: [
        {
          id: "m1",
          role: "assistant",
          text: "Partial spoken turn",
          timestamp: Date.now(),
          interrupted: true,
        },
      ],
    });
    render(
      <PlaygroundViewport
        tab="conversation"
        session={session}
        selectedMode="live"
        stage="Thinking"
        scrollRef={createRef()}
        onStart={vi.fn()}
      />,
    );

    expect(screen.getByText("Interrupted")).toBeInTheDocument();
    expect(screen.getByText("testing microphone")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Enable audio/i }));
    expect(enableAudio).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Dismiss error/i }));
    expect(clearError).toHaveBeenCalledOnce();
  });
});
