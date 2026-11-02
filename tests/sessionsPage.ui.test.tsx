import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionsPage } from "../src/pages/SessionsPage";
import { defaultConfig } from "../src/types";

afterEach(cleanup);

describe("SessionsPage", () => {
  it("renders empty-state CTA when history is empty and filters live vs demo sessions", () => {
    const onSelectSession = vi.fn();
    const onOpenClearHistory = vi.fn();
    const onOpenPlayground = vi.fn();

    const { rerender } = render(
      <SessionsPage
        allHistory={[]}
        onSelectSession={onSelectSession}
        onOpenClearHistory={onOpenClearHistory}
        onOpenPlayground={onOpenPlayground}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Open playground/i }));
    expect(onOpenPlayground).toHaveBeenCalledOnce();

    const liveEntry = {
      id: "sess-live-01",
      mode: "live" as const,
      startedAt: Date.now(),
      duration: 42,
      config: { ...defaultConfig, pipeline: "realtime" as const },
      messages: [{ id: "m1", role: "user" as const, text: "Billing query", timestamp: 1 }],
      metrics: {
        transcription_ms: null,
        llm_ms: 160,
        tts_ms: null,
        endpointing_ms: 95,
        tokens: 28,
      },
    };

    rerender(
      <SessionsPage
        allHistory={[liveEntry]}
        onSelectSession={onSelectSession}
        onOpenClearHistory={onOpenClearHistory}
        onOpenPlayground={onOpenPlayground}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Search sessions/i), {
      target: { value: "nomatch" },
    });
    expect(screen.getByText(/No sessions found/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Clear search/i }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByText("Voice session"));
    expect(onSelectSession).toHaveBeenCalledWith(liveEntry);
  });
});
