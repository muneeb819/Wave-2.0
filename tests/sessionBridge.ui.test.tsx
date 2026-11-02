import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { demoReply } from "../src/session/demoSimulator";
import { connectLiveRoom } from "../src/session/liveRoomBridge";
import { defaultBotSettings, defaultConfig, readConfig } from "../src/types";

const mockRoomHandlers = new Map<string, (...args: any[]) => void>();

vi.mock("livekit-client", () => {
  class MockRoom {
    canPlaybackAudio = true;
    remoteParticipants = new Map();
    localParticipant = {
      isMicrophoneEnabled: true,
      setMicrophoneEnabled: vi.fn(async () => {}),
      sendText: vi.fn(async () => {}),
    };
    on(event: string, cb: (...args: any[]) => void) {
      mockRoomHandlers.set(event, cb);
      return this;
    }
    connect = vi.fn(async () => {});
    disconnect = vi.fn(async () => {});
    startAudio = vi.fn(async () => {});
  }
  return {
    Room: MockRoom,
    RoomEvent: {
      ParticipantConnected: "participantConnected",
      TrackSubscribed: "trackSubscribed",
      TranscriptionReceived: "transcriptionReceived",
      DataReceived: "dataReceived",
      ParticipantAttributesChanged: "participantAttributesChanged",
      AudioPlaybackStatusChanged: "audioPlaybackStatusChanged",
      Reconnecting: "reconnecting",
      Reconnected: "reconnected",
      ParticipantDisconnected: "participantDisconnected",
      Disconnected: "disconnected",
    },
    Track: { Kind: { Audio: "audio" } },
    TokenSource: {
      developmentTokenServer: vi.fn(() => ({
        fetch: vi.fn(async () => ({
          serverUrl: "wss://sandbox.livekit.cloud",
          participantToken: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.a.b",
          roomName: "sandbox-room-1",
        })),
      })),
    },
  };
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mockRoomHandlers.clear();
  window.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("LiveRoomBridge, Capabilities, BotLinkEditor & History Modals", () => {
  it("connects live room via /api/sessions and processes agent telemetry & transcription events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              server_url: "wss://medicare-bot-z2uz9h17.livekit.cloud",
              participant_token:
                "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.sig-value-123456",
              room_name: "inference-room-99",
              agent_name: "CA_tBWDFVRz7pZS",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );

    const states: string[] = [];
    const messages: any[] = [];
    const metricsList: any[] = [];
    const partials: string[] = [];
    let stoppedReason = "";

    await connectLiveRoom(
      {
        gen: 1,
        config: defaultConfig,
        botSettings: defaultBotSettings,
        accessToken: "tok-123",
        generationRef: { current: 1 },
        runningRef: { current: true },
        connectedRef: { current: false },
        customEventsSeenRef: { current: false },
        lastUserTurnAtRef: { current: Date.now() - 150 },
        roomRef: { current: null },
        abortRef: { current: null },
        audioElementsRef: { current: [] },
        later: () => {},
        detachAudio: () => {},
        setState: (s) => {
          states.push(typeof s === "function" ? s("connecting") : s);
        },
        setPartial: (p) => partials.push(p),
        setMuted: () => {},
        setNeedsAudio: () => {},
        setError: () => {},
        log: () => {},
        upsertMessage: (m) => messages.push(m),
        updateMetrics: (m) => metricsList.push(m),
        stop: (r) => {
          stoppedReason = r || "stopped";
        },
      },
      "CA_tBWDFVRz7pZS",
      false,
    );

    // Trigger TranscriptionReceived before custom events
    const onTranscription = mockRoomHandlers.get("transcriptionReceived")!;
    onTranscription([{ id: "1", text: "Hello partial", final: false }], {
      isAgent: false,
    });
    onTranscription([{ id: "1", text: "Hello final", final: true }], {
      isAgent: false,
    });
    onTranscription(
      [{ id: "2", text: "Hi from Cloud Agent!", final: true }],
      { isAgent: true, identity: "agent-1" },
    );
    expect(partials).toContain("Hello partial");
    expect(messages.some((m) => m.text === "Hi from Cloud Agent!")).toBe(true);

    // Trigger DataReceived (`inference.events`)
    const onData = mockRoomHandlers.get("dataReceived")!;
    const encode = (obj: unknown) =>
      new TextEncoder().encode(JSON.stringify(obj));
    const agentParticipant = { isAgent: true, identity: "agent-1" };

    onData(encode({ type: "ready" }), agentParticipant, undefined, "inference.events");
    onData(
      encode({ type: "state", state: "speaking" }),
      agentParticipant,
      undefined,
      "inference.events",
    );
    onData(
      encode({
        type: "message",
        id: "m-2",
        role: "assistant",
        text: "Telemetry message",
      }),
      agentParticipant,
      undefined,
      "inference.events",
    );
    onData(
      encode({
        type: "metrics",
        transcription_ms: 110,
        llm_ms: 210,
        tts_ms: 140,
      }),
      agentParticipant,
      undefined,
      "inference.events",
    );
    onData(
      encode({ type: "error", message: "Quota exceeded" }),
      agentParticipant,
      undefined,
      "inference.events",
    );

    expect(states).toContain("speaking");
    expect(metricsList.some((m) => m.llm_ms === 210)).toBe(true);
    expect(stoppedReason).toContain("model error");
  });

  it("exercises capability chips, BotLinkEditor credential submission, Sidebar nav, and Transcript/Clear modals", async () => {
    sessionStorage.setItem(
      "inference-studio:history",
      JSON.stringify([
        {
          id: "sess-12345678",
          mode: "demo",
          startedAt: Date.now() - 60000,
          duration: 42,
          config: defaultConfig,
          messages: [
            {
              id: "msg-1",
              role: "assistant",
              text: "Saved transcript greeting",
              timestamp: Date.now() - 50000,
            },
          ],
          metrics: {
            transcription_ms: 120,
            endpointing_ms: 150,
            llm_ms: 200,
            tts_ms: 130,
            tokens: 30,
          },
        },
      ]),
    );

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("/api/credentials")) {
          return new Response(
            JSON.stringify({
              configured: true,
              missing: [],
              invalid_url: false,
              protected: false,
              agent_name: "CA_tBWDFVRz7pZS",
              server_host: "medicare-bot-z2uz9h17.livekit.cloud",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(
          JSON.stringify({
            configured: false,
            missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
            invalid_url: false,
            protected: false,
            agent_name: "CA_tBWDFVRz7pZS",
            server_host: null,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }),
    );

    const user = userEvent.setup();
    render(<App />);

    // Capability chips & turn detection select
    await user.click(screen.getByRole("button", { name: /Expressive TTS/i }));
    await user.click(screen.getByRole("button", { name: /Preemptive LLM/i }));
    await user.selectOptions(
      screen.getByLabelText("Turn detection mode"),
      "vad",
    );
    expect(readConfig().expressive).toBe(false);
    expect(readConfig().preemptive_generation).toBe(false);
    expect(readConfig().turn_detection).toBe("vad");

    // Sidebar navigation -> Sessions -> view Transcript modal -> close -> Clear history modal
    const mainNav = screen.getByRole("navigation", { name: "Main navigation" });
    await user.click(within(mainNav).getByRole("button", { name: /Sessions/i }));
    await user.click(screen.getByText("Voice session"));
    const transcriptDialog = screen.getByRole("dialog");
    expect(transcriptDialog).toHaveTextContent("Saved transcript greeting");
    await user.click(
      within(transcriptDialog).getByRole("button", { name: "Close dialog" }),
    );

    await user.click(screen.getByRole("button", { name: "Clear all history" }));
    const clearDialog = screen.getByRole("dialog");
    await user.click(
      within(clearDialog).getByRole("button", { name: /Clear history/i }),
    );
    expect(
      screen.getByText("Your next conversation belongs here."),
    ).toBeInTheDocument();

    // Sidebar navigation -> Configuration -> BotLinkEditor custom dispatch + save server credentials
    await user.click(
      within(mainNav).getByRole("button", { name: "Configuration" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Bot dispatch mode"),
      "custom",
    );
    await user.type(
      screen.getByLabelText("Custom agent dispatch name"),
      "custom-worker",
    );
    await user.type(screen.getByLabelText("LiveKit API Key"), "APIkey999");
    await user.type(
      screen.getByLabelText("LiveKit API Secret"),
      "super-secret-livekit-value",
    );
    await user.click(
      screen.getByRole("button", { name: /Save to \.env\.local/i }),
    );
    await waitFor(() => {
      expect(screen.getAllByText(/Set on server/i)).toHaveLength(3);
    });
  });

  it("covers all demoReply conversational branches across both pipelines", () => {
    const rt = { ...defaultConfig, pipeline: "realtime" as const };
    expect(demoReply("hello", defaultConfig)).toContain("Good to meet you");
    expect(demoReply("hello", rt)).toContain("speech-to-speech");
    expect(demoReply("what is the weather today", defaultConfig)).toContain(
      "local demo",
    );
    expect(demoReply("how do I setup python code", defaultConfig)).toContain(
      "Configuration",
    );
    expect(demoReply("tell me about voice sound", defaultConfig)).toContain(
      "text-to-speech",
    );
    expect(demoReply("tell me about voice sound", rt)).toContain("native audio");
    expect(demoReply("explain realtime latency", rt)).toContain("Realtime mode");
    expect(demoReply("unrecognized random topic", defaultConfig)).toContain(
      "scripted replies",
    );
  });
});
