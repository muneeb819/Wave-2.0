import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaygroundCodePanel } from "../src/sections/PlaygroundCodePanel";
import { defaultConfig } from "../src/types";

afterEach(cleanup);

describe("PlaygroundCodePanel", () => {
  it("switches between Python and Node.js snippets and copies code to clipboard", async () => {
    document.execCommand = vi.fn(() => true);
    const onCode = vi.fn();
    const onToast = vi.fn();

    render(
      <PlaygroundCodePanel
        config={defaultConfig}
        onCode={onCode}
        onToast={onToast}
      />,
    );

    expect(screen.getByText("agent.py")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Node.js" }));
    expect(screen.getByText("src/main.ts")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Copy/i }));
    await waitFor(() =>
      expect(onToast).toHaveBeenCalledWith("Node.js configuration copied."),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Get the complete agent/i }),
    );
    expect(onCode).toHaveBeenCalledOnce();
  });
});
