import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_CONFIG } from "../src/types";
import type { AgentState, BotSettings, EventLog, Message, Metrics } from "../src/types";

const BASE_BOT_SETTINGS: BotSettings = {
  botUrl: "https://cloud.livekit.io/projects/p_jg0goo2oksb/agents/CA_tBWDFVRz7pZS",
  dispatchMode: "cloud-bot",
  customAgentName: "",
  sandboxId: "",
  livekitUrl: "",
};

type RoomHandler = (...args: unknown[]) => void;

const {
  mockPostStudioSession,
  mockReadSessionBrowserCreds,
  mockMintBrowserLiveKitSession,
  FakeRoom,
} = vi.hoisted(() => {
  class HoistedFakeRoom {
    handlers = new Map<string, RoomHandler[]>();
    canPlaybackAudio = true;
    remoteParticipants = new Map<string, unknown>();
    localParticipant = {
      setMicrophoneEnabled: vi.fn(async () => undefined),
    };
    connect = vi.fn(async () => undefined);
    disconnect = vi.fn(async () => undefined);
    startAudio = vi.fn(async () => undefined);

    on(event: string, fn: RoomHandler) {
      const existing = this.handlers.get(event) ?? [];
      existing.push(fn);
      this.handlers.set(event, existing);
      return this;
    }

    emit(event: string, ...args: unknown[]) {
      for (const fn of this.handlers.get(event) ?? []) {
        fn(...args);
      }
    }
  }
  return {
    mockPostStudioSession: vi.fn(),
    mockReadSessionBrowserCreds: vi.fn(),
    mockMintBrowserLiveKitSession: vi.fn(),
    FakeRoom: HoistedFakeRoom,
  };
});

vi.mock("../src/api/studioClient", () => ({
  postStudioSession: (...args: unknown[]) => mockPostStudioSession(...args),
}));

vi.mock("../src/browserToken", () => ({
  readSessionBrowserCreds: () => mockReadSessionBrowserCreds(),
  mintBrowserLiveKitSession: (...args: unknown[]) =>
    mockMintBrowserLiveKitSession(...args),
}));

vi.mock("livekit-client", () => ({
  Room: FakeRoom,
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
  Track: {
    Kind: { Audio: "audio" },
  },
  TokenSource: {
    developmentTokenServer: vi.fn(() => ({
      fetch: vi.fn(async () => ({
        serverUrl: "wss://sandbox.livekit.cloud",
        participantToken: "sandbox-jwt",
        roomName: "sandbox-room-1",
      })),
    })),
  },
}));

import * as lk from "livekit-client";
import {
  connectLiveRoom,
  resolveSessionCredentials,
  type LiveRoomBridgeContext,
} from "../src/session/liveRoomBridge";

function makeContext(
  overrides: Partial<LiveRoomBridgeContext> = {},
): LiveRoomBridgeContext & {
  timers: Array<{ fn: () => void; ms: number }>;
  states: AgentState[];
  messages: Message[];
  logs: Array<{ msg: string; kind?: EventLog["kind"] }>;
  metricsUpdates: Partial<Metrics>[];
} {
  const timers: Array<{ fn: () => void; ms: number }> = [];
  const states: AgentState[] = ["connecting"];
  const messages: Message[] = [];
  const logs: Array<{ msg: string; kind?: EventLog["kind"] }> = [];
  const metricsUpdates: Partial<Metrics>[] = [];

  return {
    gen: 1,
    config: DEFAULT_CONFIG,
    botSettings: { ...BASE_BOT_SETTINGS },
    accessToken: "studio-token",
    generationRef: { current: 1 },
    runningRef: { current: true },
    connectedRef: { current: false },
    customEventsSeenRef: { current: false },
    lastUserTurnAtRef: { current: 0 },
    roomRef: { current: null },
    abortRef: { current: null },
    audioElementsRef: { current: [] },
    later: (fn, ms) => timers.push({ fn, ms }),
    detachAudio: vi.fn(),
    setState: (updater) => {
      const prev = states[states.length - 1] ?? "connecting";
      states.push(typeof updater === "function" ? updater(prev) : updater);
    },
    setPartial: vi.fn(),
    setMuted: vi.fn(),
    setNeedsAudio: vi.fn(),
    setError: vi.fn(),
    log: (msg, kind) => logs.push({ msg, kind }),
    upsertMessage: (m) => messages.push(m),
    updateMetrics: (v) => metricsUpdates.push(v),
    stop: vi.fn(),
    timers,
    states,
    messages,
    logs,
    metricsUpdates,
    ...overrides,
  };
}

describe("liveRoomBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves credentials via LiveKit Sandbox token server when sandboxId is set", async () => {
    const ctx = makeContext({
      botSettings: { ...BASE_BOT_SETTINGS, sandboxId: "sbx-prod-99" },
    });
    const creds = await resolveSessionCredentials(lk, ctx, "CA_agent");
    expect(creds).toEqual({
      serverUrl: "wss://sandbox.livekit.cloud",
      participantToken: "sandbox-jwt",
      roomLabel: "sandbox-room-1",
    });
  });

  it("resolves credentials via Studio backend when /api/sessions succeeds", async () => {
    mockPostStudioSession.mockResolvedValueOnce({
      kind: "ok",
      data: {
        server_url: "wss://studio.livekit.cloud",
        participant_token: "studio-jwt",
        room_name: "inference-abc",
      },
    });
    const ctx = makeContext();
    const creds = await resolveSessionCredentials(lk, ctx, "inference-studio");
    expect(creds).toEqual({
      serverUrl: "wss://studio.livekit.cloud",
      participantToken: "studio-jwt",
      roomLabel: "inference-abc",
    });
  });

  it("falls back to browser WebCrypto session minting when Studio backend fails", async () => {
    mockPostStudioSession.mockRejectedValueOnce(new Error("Offline"));
    mockReadSessionBrowserCreds.mockReturnValue({
      livekitUrl: "wss://browser.livekit.cloud",
      apiKey: "APIbrowser",
      apiSecret: "secret-32-chars-minimum-0123456789",
    });
    mockMintBrowserLiveKitSession.mockResolvedValueOnce({
      server_url: "wss://browser.livekit.cloud",
      participant_token: "browser-jwt",
      room_name: "browser-room-7",
    });
    const ctx = makeContext();
    const creds = await resolveSessionCredentials(lk, ctx, "CA_agent");
    expect(creds.roomLabel).toBe("browser-room-7");
    expect(creds.participantToken).toBe("browser-jwt");
  });

  it("bridges Room transcriptions, data channel events, attributes, and disconnect lifecycle", async () => {
    mockPostStudioSession.mockResolvedValueOnce({
      kind: "ok",
      data: {
        server_url: "wss://studio.livekit.cloud",
        participant_token: "studio-jwt",
        room_name: "inference-room",
      },
    });
    const ctx = makeContext();
    await connectLiveRoom(ctx, "", false);
    expect(ctx.roomRef.current).not.toBeNull();
    const room = ctx.roomRef.current as unknown as InstanceType<typeof FakeRoom>;

    const fakeEl = document.createElement("audio");
    room.emit(
      "trackSubscribed",
      { kind: "audio", attach: () => fakeEl },
      {},
      { isAgent: true, identity: "agent-1" },
    );
    expect(ctx.audioElementsRef.current).toHaveLength(1);
    fakeEl.remove();

    room.emit(
      "transcriptionReceived",
      [{ id: "u1", text: "hel", final: false }],
      { isAgent: false },
    );
    expect(ctx.setPartial).toHaveBeenCalledWith("hel");

    room.emit(
      "transcriptionReceived",
      [{ id: "u1", text: "hello agent", final: true, firstReceivedTime: 100 }],
      { isAgent: false },
    );
    room.emit(
      "transcriptionReceived",
      [{ id: "a1", text: "Hi there!", final: true, firstReceivedTime: 250 }],
      { isAgent: true, identity: "agent-1" },
    );
    expect(ctx.messages.map((m) => m.text)).toEqual([
      "hello agent",
      "Hi there!",
    ]);

    const encode = (obj: unknown) =>
      new TextEncoder().encode(JSON.stringify(obj));
    const agentPeer = { isAgent: true, identity: "agent-1" };
    room.emit("dataReceived", encode({ type: "ready" }), agentPeer, 0, "inference.events");
    room.emit("dataReceived", encode({ type: "state", state: "speaking" }), agentPeer, 0, "inference.events");
    room.emit("dataReceived", encode({ type: "partial", text: "stream" }), agentPeer, 0, "inference.events");
    room.emit(
      "dataReceived",
      encode({ type: "message", role: "assistant", text: "Done", interrupted: true }),
      agentPeer,
      0,
      "inference.events",
    );
    room.emit(
      "dataReceived",
      encode({ type: "metrics", llm_ms: 140, tts_ms: 95 }),
      agentPeer,
      0,
      "inference.events",
    );
    room.emit(
      "dataReceived",
      new TextEncoder().encode("{bad-json"),
      agentPeer,
      0,
      "inference.events",
    );

    room.emit("participantAttributesChanged", { "lk.agent.state": "thinking" }, agentPeer);
    room.emit("reconnecting");
    room.emit("reconnected");
    room.emit("participantDisconnected", agentPeer);
    expect(ctx.stop).toHaveBeenCalledWith("Agent disconnected.");
  });
});
