import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageHeader } from "../src/sections/PageHeader";
import { Sidebar } from "../src/sections/Sidebar";
import { defaultConfig } from "../src/types";

afterEach(cleanup);

describe("Sidebar and PageHeader", () => {
  it("navigates across Sidebar items, closes mobile scrim, and opens workspace switcher", () => {
    const onNavigate = vi.fn();
    const onCloseMobile = vi.fn();
    const onOpenConnect = vi.fn();
    const onOpenWorkspace = vi.fn();

    const { container } = render(
      <Sidebar
        page="inference"
        mobileOpen={true}
        activeAgentId="CA_bot"
        activeProjectId="p_proj"
        botUrl=""
        isLiveReady={false}
        historyCount={3}
        onNavigate={onNavigate}
        onCloseMobile={onCloseMobile}
        onOpenConnect={onOpenConnect}
        onOpenWorkspace={onOpenWorkspace}
      />,
    );

    fireEvent.click(container.querySelector(".sidebar-scrim")!);
    expect(onCloseMobile).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Wave 2\.0 home/i }));
    expect(onNavigate).toHaveBeenCalledWith("inference");

    fireEvent.click(screen.getByRole("button", { name: /Personal workspace/i }));
    expect(onOpenWorkspace).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Connect your bot/i }));
    expect(onOpenConnect).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Developer/i }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("renders PageHeader actions for sessions and settings views", () => {
    const onNavigate = vi.fn();
    const onStart = vi.fn();
    const onCheckConnection = vi.fn();

    const { rerender } = render(
      <PageHeader
        page="sessions"
        title="Sessions"
        activeAgentId="CA_bot"
        activeProjectId="p_proj"
        sessionActive={false}
        history={[
          {
            id: "h1",
            mode: "demo",
            startedAt: Date.now(),
            duration: 12,
            config: defaultConfig,
            messages: [],
            metrics: {
              transcription_ms: 80,
              llm_ms: 190,
              tts_ms: 95,
              endpointing_ms: 120,
              tokens: 32,
            },
          },
        ]}
        checking={false}
        isLiveReady={true}
        cloudLabel="Connected"
        onNavigate={onNavigate}
        onOpenCode={vi.fn()}
        onStart={onStart}
        onCheckConnection={onCheckConnection}
        onOpenConnect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /New session/i }));
    expect(onNavigate).toHaveBeenCalledWith("inference");
    expect(onStart).toHaveBeenCalledOnce();

    rerender(
      <PageHeader
        page="settings"
        title="Configuration"
        activeAgentId="CA_bot"
        activeProjectId="p_proj"
        sessionActive={false}
        history={[]}
        checking={false}
        isLiveReady={true}
        cloudLabel="Connected"
        onNavigate={onNavigate}
        onOpenCode={vi.fn()}
        onStart={onStart}
        onCheckConnection={onCheckConnection}
        onOpenConnect={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Check connection/i }));
    expect(onCheckConnection).toHaveBeenCalledOnce();
  });
});
