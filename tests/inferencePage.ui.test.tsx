import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InferencePage } from "../src/pages/InferencePage";
import { defaultConfig } from "../src/types";
import type { AgentSessionController } from "../src/useAgentSession";

afterEach(cleanup);

function stubSession(
  overrides: Partial<AgentSessionController> = {},
): AgentSessionController {
  return {
    mode: "live",
    state: "idle",
    active: false,
    muted: false,
    needsAudio: false,
    error: "",
    partial: "",
    messages: [],
    logs: [],
    history: [],
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
    ...overrides,
  };
}

describe("InferencePage", () => {
  it("renders embedded iframe mic banner, realtime model grid, and locked session notice", () => {
    const onCopy = vi.fn();
    const onSetConfig = vi.fn();
    const onToggleCapability = vi.fn();

    render(
      <InferencePage
        config={{ ...defaultConfig, pipeline: "realtime" }}
        session={stubSession({ active: true, state: "listening" })}
        selectedMode="live"
        setSelectedMode={vi.fn()}
        isEmbeddedIframe={true}
        standaloneUrl="https://studio.example.com"
        activeAgentId="CA_test"
        activeProjectId="p_proj"
        onCopy={onCopy}
        onChangePipeline={vi.fn()}
        onConfigureModel={vi.fn()}
        onOpenConnect={vi.fn()}
        onOpenRealtimeModal={vi.fn()}
        onResetDefaults={vi.fn()}
        onChangeConfig={vi.fn()}
        onSetConfig={onSetConfig}
        onToggleCapability={onToggleCapability}
        onChangeTurnDetection={vi.fn()}
        onOpenPromptModal={vi.fn()}
        onOpenVoiceModal={vi.fn()}
        onOpenKeytermsModal={vi.fn()}
        onOpenAgentCode={vi.fn()}
        onStart={vi.fn()}
        onNotify={vi.fn()}
      />,
    );

    expect(
      screen.getByRegion ? screen.getByRole("region", { name: /Chrome microphone access/i }) : screen.getByText(/Embedded preview restricts/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Model settings are locked during a session/i),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy link/i }));
    expect(onCopy).toHaveBeenCalledWith(
      "https://studio.example.com",
      expect.any(String),
    );
  });
});
