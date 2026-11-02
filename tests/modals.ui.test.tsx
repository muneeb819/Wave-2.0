import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import {
  fetchStudioStatus,
  postStudioCredentials,
  postStudioSession,
} from "../src/api/studioClient";
import { defaultConfig, readConfig } from "../src/types";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Extracted Studio Pages, Modals & API Client", () => {
  it("edits system instructions, custom voice, workspace modal, and code export tabs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith("/api/status")) {
          return new Response(
            JSON.stringify({
              configured: false,
              missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
              invalid_url: false,
              protected: false,
              agent_name: "inference-studio",
              server_host: null,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 200 });
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    // System instructions modal
    await user.click(screen.getByRole("button", { name: /Customize/i }));
    const promptDialog = screen.getByRole("dialog");
    const textarea = within(promptDialog).getByLabelText("System instructions");
    await user.clear(textarea);
    await user.type(
      textarea,
      "Speak warmly and answer questions in two brief sentences.",
    );
    await user.click(
      within(promptDialog).getByRole("button", { name: /Save instructions/i }),
    );
    expect(readConfig().instructions).toBe(
      "Speak warmly and answer questions in two brief sentences.",
    );

    // Voice modal
    await user.click(screen.getByRole("button", { name: /Default voice/i }));
    const voiceDialog = screen.getByRole("dialog");
    const voiceInput = within(voiceDialog).getByLabelText("Voice ID");
    await user.clear(voiceInput);
    await user.type(voiceInput, "custom-fish-voice-01");
    await user.click(
      within(voiceDialog).getByRole("button", { name: /Save voice/i }),
    );
    expect(readConfig().voice).toBe("custom-fish-voice-01");

    // Code export modal tabs
    await user.click(screen.getByRole("button", { name: /Get code/i }));
    const codeDialog = screen.getByRole("dialog");
    await user.click(
      within(codeDialog).getByRole("button", { name: "Node.js starter" }),
    );
    expect(codeDialog).toHaveTextContent("main.ts");
    await user.click(
      within(codeDialog).getByRole("button", { name: "Environment" }),
    );
    expect(codeDialog).toHaveTextContent(".env.example");
    await user.click(
      within(codeDialog).getByRole("button", { name: "Close dialog" }),
    );

    // Workspace modal navigation to Configuration
    await user.click(screen.getByText("Personal workspace"));
    const wsDialog = screen.getByRole("dialog");
    await user.click(
      within(wsDialog).getByRole("button", { name: "Configuration" }),
    );
    expect(
      screen.getByRole("heading", { name: "Configuration." }),
    ).toBeInTheDocument();
  });

  it("handles static 404 fallback, error details, and offline states in studioClient", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Not Found", { status: 404 })),
    );
    expect(await fetchStudioStatus()).toEqual({ kind: "static_404" });
    expect(
      await postStudioCredentials({
        livekitUrl: "wss://demo.livekit.cloud",
        apiKey: "API1234",
        apiSecret: "secret-1234567890",
        agentUrl: "",
        agentName: "my-agent",
        accessToken: "",
      }),
    ).toEqual({ kind: "static_fallback" });

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              detail: { code: "unauthorized", message: "Token required" },
            }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    expect(
      await postStudioSession({
        config: defaultConfig,
        agentName: "my-agent",
        accessToken: "",
      }),
    ).toEqual({ kind: "error", message: "Token required" });
  });
});
