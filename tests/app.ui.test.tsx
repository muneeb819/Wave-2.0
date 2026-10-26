import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { spawnSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { mintBrowserLiveKitSession } from "../src/browserToken";
import { fullAgent, nodeAgent, quickstartAgent, snippet } from "../src/code";
import { defaultConfig, readConfig } from "../src/types";

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/status")) {
        return new Response(
          JSON.stringify({
            configured: false,
            missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
            invalid_url: false,
            protected: false,
            agent_name: "inference-studio",
            pipelines: ["stt-llm-tts", "realtime"],
            server_host: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ detail: "Not mocked" }), {
        status: 503,
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Wave 2.0 Studio Workbench UI & Code Generation", () => {
  it("renders Quickstart STT-LLM-TTS default stack, TurnDetector, and ai-coustics options", async () => {
    render(<App />);
    expect(
      screen.getByRole("heading", { name: "Inference." }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Speech to text model")).toHaveValue(
      "assemblyai/universal-3-6-pro",
    );
    expect(screen.getByLabelText("Language model")).toHaveValue(
      "google/gemma-4-31b-it",
    );
    expect(screen.getByLabelText("Text to speech model")).toHaveValue(
      "fishaudio/s2.1-pro",
    );
    expect(screen.getByLabelText("Turn detection mode")).toHaveValue(
      "turn_detector",
    );
    expect(
      screen.getByRole("button", { name: /Noise cancellation/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("switches cleanly between STT-LLM-TTS pipeline and Realtime speech-to-speech pipeline", async () => {
    const user = userEvent.setup();
    render(<App />);

    // Open Realtime modal from architecture node and activate Realtime pipeline
    await user.click(screen.getByTitle("Realtime speech-to-speech pipeline"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("GPT Realtime 2.1");
    await user.click(
      within(dialog).getByRole("button", { name: /Enable Realtime pipeline/i }),
    );

    expect(screen.getByLabelText("Realtime speech model")).toHaveValue(
      "openai/gpt-realtime-2.1",
    );
    expect(screen.getByLabelText("Realtime voice")).toHaveValue("marin");

    // Live Python snippet updates automatically to RealtimeModel
    expect(
      screen.getByRole("region", { name: "Quick start code" }),
    ).toHaveTextContent('model="openai/gpt-realtime-2.1"');

    // Switch to Node.js view inside playground code panel
    await user.click(screen.getByRole("button", { name: "Node.js" }));
    expect(
      screen.getByRole("region", { name: "Quick start code" }),
    ).toHaveTextContent("@livekit/agents");
  });

  it("produces syntactically valid Python for every exported Python tab in both pipelines", () => {
    for (const pipeline of ["stt-llm-tts", "realtime"] as const) {
      for (const noise_cancellation of [true, false]) {
        const cfg = { ...defaultConfig, pipeline, noise_cancellation };
        for (const pySource of [
          snippet(cfg, "python"),
          quickstartAgent(cfg),
          fullAgent(cfg),
        ]) {
          const check = spawnSync(
            "python",
            ["-c", "import ast, sys; ast.parse(sys.stdin.read())"],
            { input: pySource },
          );
          expect(check.status, check.stderr.toString()).toBe(0);
        }
        const tsSource = nodeAgent(cfg);
        expect(tsSource).toContain("defineAgent");
        if (!noise_cancellation) {
          expect(tsSource).not.toContain("plugins-ai-coustics");
        } else {
          expect(tsSource).toContain("audioEnhancement");
        }
      }
    }
  });

  it("supports editing system instructions, voice ID, and STT keyterms with persistence", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Keyterms 2 terms" }));
    const ktInput = screen.getByLabelText("Keyterms list");
    await user.clear(ktInput);
    await user.type(ktInput, "LiveKit, Wave 2.0, AssemblyAI");
    await user.click(screen.getByRole("button", { name: /Save keyterms/i }));

    expect(
      screen.getByRole("button", { name: "Keyterms 3 terms" }),
    ).toBeInTheDocument();

    const stored = readConfig();
    expect(stored.keyterms).toEqual(["LiveKit", "Wave 2.0", "AssemblyAI"]);
  });

  it("runs a full demo conversation, records metrics and history, and supports Configuration self-hosted toggle", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Start session" }));
    await waitFor(
      () => {
        expect(screen.getByText(/Hey there!/i)).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await waitFor(
      () => {
        expect(
          screen.getByLabelText("Message to your agent"),
        ).not.toBeDisabled();
      },
      { timeout: 3000 },
    );

    await user.type(
      screen.getByLabelText("Message to your agent"),
      "How does the pipeline work?",
    );
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(
      () => {
        expect(
          screen.getByText(
            /Universal 3.6 Pro transcribes your speech, Gemma 4 31B generates a reply/i,
          ),
        ).toBeInTheDocument();
      },
      { timeout: 3000 },
    );

    await user.click(
      screen.getAllByRole("button", { name: "End session" })[0],
    );

    // Navigate to Sessions and verify entry recorded
    const viewsNav = screen.getByRole("navigation", {
      name: "Workspace views",
    });
    await user.click(within(viewsNav).getByRole("button", { name: /Sessions/ }));
    expect(screen.getByText("Voice session")).toBeInTheDocument();

    // Navigate to Configuration and verify CLI & self-hosted controls
    await user.click(
      within(viewsNav).getByRole("button", { name: "Configuration" }),
    );
    expect(
      screen.getByRole("heading", { name: "Configuration." }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Linux" }));
    expect(
      screen.getByText(/curl -sSL https:\/\/get.livekit.io\/cli/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Switch to self-hosted preset/i }),
    );
    expect(readConfig().noise_cancellation).toBe(false);
    expect(readConfig().turn_detection).toBe("vad");
  });

  it("migrates legacy saved STT preset once while preserving user preferences", () => {
    localStorage.setItem(
      "inference-studio:config",
      JSON.stringify({
        stt: "deepgram/nova-3",
        language: "es",
        llm: "openai/gpt-4.1-mini",
        tts: "fishaudio/s2-pro",
        voice: "preserved-voice-123",
        instructions:
          "Keep my existing instructions while migrating to the new quickstart STT.",
      }),
    );
    localStorage.removeItem("inference-studio:stt-preset");

    const migrated = readConfig();
    expect(migrated.stt).toBe("assemblyai/universal-3-6-pro");
    expect(migrated.language).toBe("en");
    expect(migrated.llm).toBe("openai/gpt-4.1-mini");
    expect(migrated.tts).toBe("fishaudio/s2-pro");
    expect(migrated.voice).toBe("preserved-voice-123");
  });

  it("pre-configures LiveKit Cloud bot CA_tBWDFVRz7pZS (project p_jg0goo2oksb) right in the UI", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("button", { name: /Bot · CA_tBWDFVRz7pZS/i }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /Bot · CA_tBWDFVRz7pZS/i }),
    );
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText("LiveKit Cloud Bot URL")).toHaveValue(
      "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS",
    );
    expect(within(dialog).getByLabelText("Bot dispatch mode")).toHaveValue(
      "cloud-bot",
    );
  });

  it("mints WebCrypto HS256 JWTs verified by official livekit.api.TokenVerifier for CA_tBWDFVRz7pZS", async () => {
    const minted = await mintBrowserLiveKitSession(
      {
        livekitUrl: "wss://medicare-bot-z2uz9h17.livekit.cloud",
        apiKey: "APItestKey123",
        apiSecret: "super-secret-livekit-key-at-least-32-chars",
      },
      defaultConfig,
      "CA_tBWDFVRz7pZS",
    );
    const verify = spawnSync(
      process.env.VITEST_PYTHON_BIN || "uv",
      process.env.VITEST_PYTHON_BIN
        ? [
            "-c",
            [
              "import sys",
              "from livekit import api",
              "verifier = api.TokenVerifier('APItestKey123', 'super-secret-livekit-key-at-least-32-chars')",
              "claims = verifier.verify(sys.stdin.read().strip())",
              "assert claims.video.room_join is True",
              "assert claims.room_config.agents[0].agent_name == 'CA_tBWDFVRz7pZS'",
            ].join("\n"),
          ]
        : [
            "run",
            "python",
            "-c",
            [
              "import sys",
              "from livekit import api",
              "verifier = api.TokenVerifier('APItestKey123', 'super-secret-livekit-key-at-least-32-chars')",
              "claims = verifier.verify(sys.stdin.read().strip())",
              "assert claims.video.room_join is True",
              "assert claims.room_config.agents[0].agent_name == 'CA_tBWDFVRz7pZS'",
            ].join("\n"),
          ],
      { input: minted.participant_token },
    );
    expect(verify.status, verify.stderr.toString()).toBe(0);
  });
});
