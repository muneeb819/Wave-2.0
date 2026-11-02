import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TranscriptModal } from "../src/sections/SessionModals";
import { formatTranscriptMarkdown } from "../src/session/demoSimulator";
import { defaultConfig } from "../src/types";
import type { HistoryEntry } from "../src/types";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const SAMPLE_ENTRY: HistoryEntry = {
  id: "abc12345-6789",
  mode: "live",
  startedAt: 1730500000000,
  duration: 75,
  config: defaultConfig,
  messages: [
    {
      id: "m1",
      role: "user",
      text: "How fast is preemptive generation?",
      timestamp: 1730500002000,
    },
    {
      id: "m2",
      role: "assistant",
      text: "It starts generating tokens while turn detection finishes.",
      timestamp: 1730500003500,
      interrupted: true,
    },
  ],
  metrics: {
    transcription_ms: 95,
    endpointing_ms: 120,
    llm_ms: 180,
    tts_ms: 110,
    tokens: 40,
  },
};

describe("Markdown Transcript Export", () => {
  it("formats pipeline metadata and interrupted turns into Markdown and copies from TranscriptModal", async () => {
    const md = formatTranscriptMarkdown(SAMPLE_ENTRY);
    expect(md).toContain("# Voice Session abc12345");
    expect(md).toContain("- **Duration**: 01:15");
    expect(md).toContain("- **User**: How fast is preemptive generation?");
    expect(md).toContain("- **Agent** _(interrupted)_: It starts generating");

    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(
      <TranscriptModal
        entry={SAMPLE_ENTRY}
        onDelete={onDelete}
        onClose={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Copy Markdown/i }));
    expect(
      screen.getByRole("button", { name: /Copied Markdown/i }),
    ).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(md);

    await user.click(screen.getByRole("button", { name: /Delete session/i }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
