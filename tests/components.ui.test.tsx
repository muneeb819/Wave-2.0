import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ChatAvatar,
  CodeBlock,
  CopyButton,
  EmptyState,
  Equalizer,
  LiveKitLogo,
  Modal,
  Pill,
  ProviderMark,
  SetupSteps,
  StartupModesPanel,
} from "../src/components";

afterEach(() => {
  cleanup();
});

describe("Modular UI Components", () => {
  it("renders ProviderMark variants for every supported inference provider", () => {
    const marks = [
      "xai",
      "cartesia",
      "google",
      "fish",
      "deepgram",
      "assembly",
      "openai",
    ];
    const { container } = render(
      <div>
        {marks.map((mark) => (
          <ProviderMark key={mark} mark={mark} />
        ))}
      </div>,
    );
    expect(container.querySelector(".xai-mark")).toHaveTextContent("xAI");
    expect(container.querySelector(".cartesia-mark")).toHaveTextContent("C");
    expect(container.querySelector(".google-mark")).toHaveTextContent("G");
    expect(container.querySelector(".assembly-mark")).toHaveTextContent("A");
    expect(container.querySelector(".deepgram-mark svg")).toBeInTheDocument();
    expect(container.querySelector(".fish-mark")).toBeInTheDocument();
    expect(container.querySelector(".openai-mark")).toBeInTheDocument();
  });

  it("highlights keywords, SDK classes, comments, and strings in CodeBlock", () => {
    const sample = [
      "# Quickstart voice pipeline",
      'from livekit.agents import AgentSession',
      'model = "google/gemma-4-31b-it"',
      "",
    ].join("\n");
    const { container } = render(<CodeBlock code={sample} lineNumbers compact />);
    expect(container.querySelector("pre.code-block.compact")).toBeInTheDocument();
    expect(container.querySelectorAll(".line-number")).toHaveLength(4);
    expect(container.querySelector(".token-comment")).toHaveTextContent(
      "# Quickstart voice pipeline",
    );
    expect(container.querySelector(".token-keyword")).toHaveTextContent("from");
    expect(container.querySelector(".token-class")).toHaveTextContent(
      "AgentSession",
    );
    expect(container.querySelector(".token-string")).toHaveTextContent(
      '"google/gemma-4-31b-it"',
    );
  });

  it("handles Modal Escape key, backdrop clicks, and Tab focus cycling", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const { container } = render(
      <Modal title="Voice Settings" eyebrow="AUDIO" onClose={onClose}>
        <input aria-label="First input" />
        <button type="button">Confirm</button>
      </Modal>,
    );

    const dialog = screen.getByRole("dialog", { name: "Voice Settings" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText("AUDIO")).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: "Close dialog" });
    const confirmBtn = screen.getByRole("button", { name: "Confirm" });

    confirmBtn.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(closeBtn).toHaveFocus();

    closeBtn.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(confirmBtn).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector(".modal-backdrop") as HTMLElement;
    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("switches SetupSteps OS and SDK tabs and triggers StartupModesPanel copy", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    render(
      <div>
        <SetupSteps />
        <StartupModesPanel onCopy={onCopy} />
      </div>,
    );

    await user.click(screen.getByRole("tab", { name: "Windows" }));
    expect(
      screen.getByText(/winget install LiveKit\.LiveKitCLI/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Node.js (pnpm)" }));
    expect(
      screen.getByText(/cd agent-node && pnpm install/i),
    ).toBeInTheDocument();

    const copyButtons = screen.getAllByRole("button", { name: /Copy/i });
    await user.click(copyButtons[0]);
    expect(onCopy).toHaveBeenCalledWith(
      "uv run agent.py console",
      'Copied "uv run agent.py console" to clipboard.',
    );
  });

  it("renders status primitives (LiveKitLogo, Pill, CopyButton, EmptyState, Equalizer, ChatAvatar)", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    const { container } = render(
      <div>
        <LiveKitLogo small />
        <Pill tone="green">Connected</Pill>
        <CopyButton onClick={onClick} label="Copy snippet" copied />
        <EmptyState icon="search" title="Nothing matched">
          Try clearing filters.
        </EmptyState>
        <Equalizer active small />
        <ChatAvatar role="user" />
        <ChatAvatar role="assistant" />
      </div>,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Nothing matched")).toBeInTheDocument();
    expect(
      container.querySelector(".equalizer.animated.small"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy snippet" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
