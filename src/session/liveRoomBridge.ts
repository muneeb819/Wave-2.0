import type { MutableRefObject } from "react";
import type { Room, Track } from "livekit-client";
import { postStudioSession } from "../api/studioClient";
import {
  mintBrowserLiveKitSession,
  readSessionBrowserCreds,
} from "../browserToken";
import { emptyMetrics, uid } from "../types";
import type {
  AgentState,
  BotSettings,
  Config,
  EventLog,
  Message,
  Metrics,
} from "../types";

const VALID_STATES = ["listening", "thinking", "speaking"] as const;

export type LiveRoomBridgeContext = {
  gen: number;
  config: Config;
  botSettings: BotSettings;
  accessToken: string;
  generationRef: MutableRefObject<number>;
  runningRef: MutableRefObject<boolean>;
  connectedRef: MutableRefObject<boolean>;
  customEventsSeenRef: MutableRefObject<boolean>;
  lastUserTurnAtRef: MutableRefObject<number>;
  roomRef: MutableRefObject<Room | null>;
  abortRef: MutableRefObject<AbortController | null>;
  audioElementsRef: MutableRefObject<HTMLMediaElement[]>;
  later: (fn: () => void, ms: number) => void;
  detachAudio: () => void;
  setState: (updater: AgentState | ((prev: AgentState) => AgentState)) => void;
  setPartial: (text: string) => void;
  setMuted: (muted: boolean) => void;
  setNeedsAudio: (needs: boolean) => void;
  setError: (msg: string) => void;
  log: (message: string, kind?: EventLog["kind"]) => void;
  upsertMessage: (message: Message) => void;
  updateMetrics: (values: Partial<Metrics>) => void;
  stop: (reason?: string) => void;
};

async function resolveSessionCredentials(
  lk: typeof import("livekit-client"),
  ctx: LiveRoomBridgeContext,
  targetAgentName: string,
): Promise<{
  serverUrl: string;
  participantToken: string;
  roomLabel: string;
}> {
  const { botSettings, config, accessToken, abortRef, log } = ctx;
  if (botSettings.sandboxId.trim()) {
    log(
      `Fetching LiveKit Sandbox credentials (${botSettings.sandboxId.trim()})${targetAgentName ? ` for agent ${targetAgentName}` : " (automatic dispatch)"}…`,
    );
    const tokenSource = lk.TokenSource.developmentTokenServer(
      botSettings.sandboxId.trim(),
    );
    const details = await tokenSource.fetch(
      targetAgentName ? { agentName: targetAgentName } : {},
    );
    return {
      serverUrl: details.serverUrl,
      participantToken: details.participantToken,
      roomLabel: (details as { roomName?: string }).roomName || "cloud-room",
    };
  }

  try {
    const result = await postStudioSession({
      config,
      agentName: targetAgentName,
      accessToken,
      signal: abortRef.current?.signal,
    });
    if (result.kind === "ok") {
      return {
        serverUrl: result.data.server_url,
        participantToken: result.data.participant_token,
        roomLabel: result.data.room_name,
      };
    }
    if (result.kind === "error" && !readSessionBrowserCreds()) {
      throw new Error(result.message);
    }
  } catch (fetchErr) {
    if (!readSessionBrowserCreds()) throw fetchErr;
  }

  const sessionCreds = readSessionBrowserCreds();
  if (!sessionCreds) {
    throw new Error(
      "Enter your LiveKit Sandbox ID or Project API Key & Secret in Bot settings first.",
    );
  }
  const browserSession = await mintBrowserLiveKitSession(
    sessionCreds,
    config,
    targetAgentName,
  );
  return {
    serverUrl: browserSession.server_url,
    participantToken: browserSession.participant_token,
    roomLabel: browserSession.room_name,
  };
}

export async function connectLiveRoom(
  ctx: LiveRoomBridgeContext,
  targetAgentName: string,
  allowAutoFallback: boolean,
): Promise<void> {
  ctx.abortRef.current = new AbortController();
  const lk = await import("livekit-client");
  if (ctx.generationRef.current !== ctx.gen) return;

  const { serverUrl, participantToken, roomLabel } =
    await resolveSessionCredentials(lk, ctx, targetAgentName);
  if (ctx.generationRef.current !== ctx.gen) return;

  const room = new lk.Room({
    adaptiveStream: true,
    dynacast: true,
    audioCaptureDefaults: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  ctx.roomRef.current = room;
  let agentReady = false;
  let switchingFallback = false;

  const attachTrackElement = (track: Track) => {
    const element = track.attach();
    element.setAttribute("data-inference-audio", "true");
    element.style.display = "none";
    document.body.appendChild(element);
    ctx.audioElementsRef.current.push(element);
    void room.startAudio().catch(() => ctx.setNeedsAudio(true));
  };

  const markReady = (participantIdentity?: string) => {
    if (!agentReady) {
      agentReady = true;
      ctx.setState((prev) => (prev === "connecting" ? "listening" : prev));
      ctx.log(
        `Connected to LiveKit agent${participantIdentity ? ` (${participantIdentity})` : targetAgentName ? ` (${targetAgentName})` : ""}. Voice & chat ready.`,
        "success",
      );
    }
  };

  room.on(lk.RoomEvent.ParticipantConnected, (participant) => {
    if (participant.isAgent) {
      markReady(participant.identity);
      const attrState = participant.attributes?.["lk.agent.state"];
      if (
        attrState &&
        VALID_STATES.includes(attrState as (typeof VALID_STATES)[number])
      ) {
        ctx.setState(attrState as AgentState);
      }
    }
  });

  room.on(
    lk.RoomEvent.TrackSubscribed,
    (track, _publication, participant) => {
      if (track.kind === lk.Track.Kind.Audio && participant.isAgent) {
        markReady(participant.identity);
        attachTrackElement(track);
      }
    },
  );

  room.on(lk.RoomEvent.TranscriptionReceived, (segments, participant) => {
    if (ctx.customEventsSeenRef.current) return;
    const isAgentSpeaker = Boolean(participant?.isAgent);
    for (const segment of segments) {
      const text = (segment.text || "").trim();
      if (!text) continue;
      if (isAgentSpeaker) {
        markReady(participant?.identity);
        if (ctx.lastUserTurnAtRef.current > 0) {
          const turnLatency = Math.round(
            Date.now() - ctx.lastUserTurnAtRef.current,
          );
          if (turnLatency > 0 && turnLatency < 30000) {
            ctx.updateMetrics({ llm_ms: turnLatency });
          }
          ctx.lastUserTurnAtRef.current = 0;
        }
        ctx.upsertMessage({
          id: `seg-${segment.id}`,
          role: "assistant",
          text,
          timestamp: segment.firstReceivedTime || Date.now(),
        });
      } else if (!segment.final) {
        ctx.setPartial(text);
      } else {
        ctx.setPartial("");
        ctx.lastUserTurnAtRef.current = Date.now();
        ctx.upsertMessage({
          id: `seg-${segment.id}`,
          role: "user",
          text,
          timestamp: segment.firstReceivedTime || Date.now(),
        });
      }
    }
  });

  room.on(lk.RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
    if (topic !== "inference.events" || !participant?.isAgent) return;
    ctx.customEventsSeenRef.current = true;
    try {
      const event = JSON.parse(new TextDecoder().decode(payload));
      if (event.type === "ready") {
        markReady(participant.identity);
        ctx.setState("listening");
      }
      if (event.type === "state" && VALID_STATES.includes(event.state)) {
        markReady(participant.identity);
        ctx.setState(event.state);
        ctx.log(`Agent is ${event.state}.`);
      }
      if (event.type === "partial" && typeof event.text === "string") {
        ctx.setPartial(event.text);
      }
      if (
        event.type === "message" &&
        typeof event.text === "string" &&
        ["user", "assistant"].includes(event.role)
      ) {
        ctx.upsertMessage({
          id: event.id || uid(),
          role: event.role,
          text: event.text,
          timestamp: event.timestamp || Date.now(),
          interrupted: !!event.interrupted,
        });
        if (event.role === "user") ctx.setPartial("");
      }
      if (event.type === "metrics") {
        const values: Partial<Metrics> = {};
        for (const key of Object.keys(emptyMetrics) as (keyof Metrics)[]) {
          if (typeof event[key] === "number" && Number.isFinite(event[key])) {
            values[key] = Math.max(0, event[key]);
          }
        }
        ctx.updateMetrics(values);
      }
      if (event.type === "error") {
        const message =
          typeof event.message === "string"
            ? event.message
            : "The voice pipeline encountered an error.";
        ctx.setError(message);
        ctx.log(message, "error");
        ctx.stop("The voice pipeline stopped after a model error.");
      }
    } catch {
      ctx.log("An unreadable room event was ignored.", "warning");
    }
  });

  room.on(
    lk.RoomEvent.ParticipantAttributesChanged,
    (attributes, participant) => {
      const nextState = attributes["lk.agent.state"];
      if (
        participant.isAgent &&
        nextState &&
        VALID_STATES.includes(nextState as (typeof VALID_STATES)[number])
      ) {
        markReady(participant.identity);
        ctx.setState(nextState as AgentState);
      }
    },
  );

  room.on(lk.RoomEvent.AudioPlaybackStatusChanged, () =>
    ctx.setNeedsAudio(!room.canPlaybackAudio),
  );
  room.on(lk.RoomEvent.Reconnecting, () => {
    ctx.setState("reconnecting");
    ctx.log("Connection interrupted. Reconnecting…", "warning");
  });
  room.on(lk.RoomEvent.Reconnected, () => {
    ctx.setState("listening");
    ctx.log("Room connection restored.", "success");
  });
  room.on(lk.RoomEvent.ParticipantDisconnected, (participant) => {
    if (participant.isAgent && ctx.runningRef.current && !switchingFallback) {
      ctx.setError(
        "The agent left the room. Start another session when ready.",
      );
      ctx.stop("Agent disconnected.");
    }
  });
  room.on(lk.RoomEvent.Disconnected, () => {
    if (ctx.runningRef.current && !switchingFallback) {
      ctx.stop("Room connection closed.");
    }
  });

  ctx.log(
    `Connecting to room ${roomLabel}${targetAgentName ? ` → dispatching ${targetAgentName}` : " → automatic cloud dispatch"}…`,
  );
  await room.connect(serverUrl, participantToken);
  if (ctx.generationRef.current !== ctx.gen) {
    await room.disconnect();
    return;
  }
  ctx.connectedRef.current = true;
  ctx.log("WebRTC room connected.", "success");

  for (const remote of room.remoteParticipants.values()) {
    if (remote.isAgent) {
      markReady(remote.identity);
      const attrState = remote.attributes?.["lk.agent.state"];
      if (
        attrState &&
        VALID_STATES.includes(attrState as (typeof VALID_STATES)[number])
      ) {
        ctx.setState(attrState as AgentState);
      }
      for (const pub of remote.audioTrackPublications.values()) {
        if (pub.track) attachTrackElement(pub.track);
      }
    }
  }

  if (typeof navigator.mediaDevices?.getUserMedia === "function") {
    try {
      await room.localParticipant.setMicrophoneEnabled(true);
      ctx.log("Microphone enabled and streaming.");
    } catch (micErr) {
      ctx.setMuted(true);
      const name = micErr instanceof Error ? micErr.name : "";
      ctx.log(
        name === "NotAllowedError"
          ? "Microphone blocked by browser/iframe — connected in listen + live text chat mode (open in a standalone browser tab for voice mic)."
          : "No microphone detected — connected in listen + live text chat mode.",
        "warning",
      );
    }
  } else {
    ctx.setMuted(true);
    ctx.log(
      "Browser microphone unavailable — connected in listen + live text chat mode.",
      "warning",
    );
  }

  void room.startAudio().catch(() => ctx.setNeedsAudio(true));

  if (allowAutoFallback && targetAgentName) {
    ctx.later(() => {
      if (
        !agentReady &&
        ctx.runningRef.current &&
        ctx.generationRef.current === ctx.gen
      ) {
        switchingFallback = true;
        ctx.log(
          `No explicit worker answered "${targetAgentName}" in 7s — automatically switching to LiveKit Cloud automatic dispatch…`,
          "warning",
        );
        ctx.detachAudio();
        ctx.roomRef.current = null;
        void room.disconnect().finally(() => {
          if (ctx.runningRef.current && ctx.generationRef.current === ctx.gen) {
            void connectLiveRoom(ctx, "", false).catch((err: unknown) => {
              const msg =
                err instanceof Error
                  ? err.message
                  : "Automatic dispatch retry failed.";
              ctx.setError(msg);
              ctx.log(msg, "error");
              ctx.stop("Could not reach Cloud agent.");
            });
          }
        });
      }
    }, 7000);
    return;
  }

  ctx.later(() => {
    if (!agentReady) {
      ctx.setError(
        `No agent joined the room. Verify your bot (${ctx.botSettings.botUrl}) is deployed and running in LiveKit Cloud, or run python -m backend.agent dev locally.`,
      );
      ctx.stop("Timed out waiting for the LiveKit agent.");
    }
  }, 20000);
}
