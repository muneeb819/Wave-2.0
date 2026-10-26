import { useCallback, useEffect, useRef, useState } from "react";
import type { Room, Track } from "livekit-client";
import {
  mintBrowserLiveKitSession,
  readSessionBrowserCreds,
} from "./browserToken";
import {
  defaultBotSettings,
  emptyMetrics,
  getModel,
  resolveDispatchAgentName,
  uid,
} from "./types";
import type {
  AgentState,
  BotSettings,
  Config,
  EventLog,
  HistoryEntry,
  Message,
  Metrics,
  SessionMode,
} from "./types";

const validStates = ["listening", "thinking", "speaking"] as const;

function demoReply(text: string, config: Config) {
  const lower = text.toLowerCase();
  if (/hello|hi\b|hey\b/.test(lower))
    return config.pipeline === "realtime"
      ? `Hey! Good to meet you. This is a local demo of your ${getModel("realtime", config.realtime_model).name} speech-to-speech pipeline. What would you like to explore?`
      : "Hey! Good to meet you. This is a local demo of your voice agent. What would you like to know about the inference pipeline?";
  if (/weather|time|news|today/.test(lower))
    return "I'm a local demo, so I can't check live information yet. In Live mode, your LiveKit Cloud bot executes tools directly on LiveKit Cloud.";
  if (/code|python|node|build|start|connect|setup/.test(lower))
    return "Connect your LiveKit Cloud project (API keys or Sandbox ID) in Configuration, then switch this playground to Live to speak directly with your bot.";
  if (/voice|fish|speech|sound/.test(lower))
    return config.pipeline === "realtime"
      ? `Your speech-to-speech model ${getModel("realtime", config.realtime_model).name} streams native audio directly with voice "${config.realtime_voice}" without a separate TTS hop.`
      : `Your text-to-speech model is ${getModel("tts", config.tts).name} (${getModel("tts", config.tts).provider}). With expressive mode enabled, LiveKit Inference renders natural tone and pacing automatically.`;
  if (/model|pipeline|inference|work|latency|livekit|realtime/.test(lower))
    return config.pipeline === "realtime"
      ? `In Realtime mode, ${getModel("realtime", config.realtime_model).name} processes your spoken audio directly end-to-end speech-to-speech through LiveKit Inference with ${config.noise_cancellation ? "ai-coustics QUAIL VF-S noise cancellation" : "direct audio input"}.`
      : `In a live session, ${getModel("stt", config.stt).name} transcribes your speech, ${getModel("llm", config.llm).name} generates a reply, and ${getModel("tts", config.tts).name} turns it into audio with LiveKit TurnDetector and ${config.noise_cancellation ? "ai-coustics noise cancellation" : "local audio input"}.`;
  return "That's a great prompt for your agent. This demo uses scripted replies rather than a live model. Switch to Live once your Cloud credentials are saved to talk directly with your bot.";
}

function loadHistory(): HistoryEntry[] {
  try {
    const value = JSON.parse(
      sessionStorage.getItem("inference-studio:history") || "[]",
    );
    return Array.isArray(value) ? value.slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function useAgentSession(
  config: Config,
  botSettings: BotSettings = defaultBotSettings,
) {
  const [state, setState] = useState<AgentState>("idle");
  const [mode, setMode] = useState<SessionMode>("demo");
  const [messages, setMessages] = useState<Message[]>([]);
  const [metrics, setMetrics] = useState<Metrics>({ ...emptyMetrics });
  const [logs, setLogs] = useState<EventLog[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState("");
  const [partial, setPartial] = useState("");
  const [needsAudio, setNeedsAudio] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const audioElements = useRef<HTMLMediaElement[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const turn = useRef(0);
  const running = useRef(false);
  const connected = useRef(false);
  const startedAt = useRef(0);
  const lastUserTurnAt = useRef(0);
  const customEventsSeen = useRef(false);
  const sessionMode = useRef<SessionMode>("demo");
  const sessionConfig = useRef<Config>(config);
  const messagesRef = useRef<Message[]>([]);
  const metricsRef = useRef<Metrics>({ ...emptyMetrics });
  const active = !["idle", "ended"].includes(state);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        "inference-studio:history",
        JSON.stringify(history),
      );
    } catch {
      /* Browser storage may be disabled/full. */
    }
  }, [history]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(
      () =>
        setElapsed(
          Math.max(0, Math.floor((Date.now() - startedAt.current) / 1000)),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [active]);

  const log = useCallback(
    (message: string, kind: EventLog["kind"] = "info") => {
      setLogs((current) => [
        ...current.slice(-99),
        { id: uid(), timestamp: Date.now(), message, kind },
      ]);
    },
    [],
  );

  const upsertMessage = useCallback((message: Message) => {
    setMessages((current) => {
      const existingIdx = current.findIndex((item) => item.id === message.id);
      if (existingIdx >= 0) {
        const next = current.map((item, idx) =>
          idx === existingIdx ? { ...item, ...message } : item,
        );
        messagesRef.current = next;
        return next;
      }
      const optimistic =
        message.role === "user"
          ? current.findIndex(
              (item) =>
                item.role === "user" &&
                item.pending &&
                item.text === message.text,
            )
          : -1;
      const next =
        optimistic >= 0
          ? current.map((item, index) =>
              index === optimistic ? { ...message, pending: false } : item,
            )
          : [...current.slice(-149), message];
      messagesRef.current = next;
      return next;
    });
  }, []);

  const updateMetrics = useCallback((values: Partial<Metrics>) => {
    setMetrics((current) => {
      const next = { ...current, ...values };
      metricsRef.current = next;
      return next;
    });
  }, []);

  const detachAudio = useCallback(() => {
    audioElements.current.forEach((element) => {
      element.pause();
      element.srcObject = null;
      element.remove();
    });
    audioElements.current = [];
  }, []);

  const stop = useCallback(
    (reason?: string) => {
      if (!running.current) return;
      running.current = false;
      generation.current += 1;
      abort.current?.abort();
      abort.current = null;
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const room = roomRef.current;
      roomRef.current = null;
      void room?.disconnect();
      detachAudio();
      if (connected.current || messagesRef.current.length > 0) {
        const entry: HistoryEntry = {
          id: uid(),
          mode: sessionMode.current,
          startedAt: startedAt.current,
          duration: Math.max(
            1,
            Math.floor((Date.now() - startedAt.current) / 1000),
          ),
          config: sessionConfig.current,
          messages: messagesRef.current,
          metrics: metricsRef.current,
        };
        setHistory((current) => [entry, ...current].slice(0, 20));
      }
      setPartial("");
      setNeedsAudio(false);
      setState("ended");
      log(
        reason || "Session ended. Microphone and room disconnected.",
        reason ? "warning" : "info",
      );
    },
    [detachAudio, log],
  );

  useEffect(
    () => () => {
      running.current = false;
      generation.current += 1;
      abort.current?.abort();
      timers.current.forEach(clearTimeout);
      void roomRef.current?.disconnect();
      detachAudio();
    },
    [detachAudio],
  );

  const start = useCallback(
    async (selectedMode: SessionMode, accessToken = "") => {
      if (running.current) return;
      running.current = true;
      connected.current = false;
      customEventsSeen.current = false;
      const gen = ++generation.current;
      turn.current = 0;
      sessionMode.current = selectedMode;
      sessionConfig.current = { ...config, keyterms: [...config.keyterms] };
      startedAt.current = Date.now();
      lastUserTurnAt.current = Date.now();
      messagesRef.current = [];
      metricsRef.current = { ...emptyMetrics };
      setMessages([]);
      setMetrics({ ...emptyMetrics });
      setLogs([]);
      setElapsed(0);
      setError("");
      setPartial("");
      setMuted(false);
      setMode(selectedMode);
      setState("connecting");

      const later = (fn: () => void, ms: number) => {
        const timer = setTimeout(() => {
          if (generation.current === gen && running.current) fn();
        }, ms);
        timers.current.push(timer);
        return timer;
      };

      if (selectedMode === "demo") {
        log(
          "Demo started. No microphone, network inference, or provider requests.",
          "warning",
        );
        later(() => {
          connected.current = true;
          if (turn.current !== 0) return;
          setState("speaking");
          log(
            config.pipeline === "realtime"
              ? `Simulated Realtime (${getModel("realtime", config.realtime_model).name}) pipeline ready.`
              : "Simulated STT → LLM → TTS pipeline ready.",
            "success",
          );
          upsertMessage({
            id: uid(),
            role: "assistant",
            text:
              config.pipeline === "realtime"
                ? `Hey there! You're previewing the ${getModel("realtime", config.realtime_model).name} speech-to-speech pipeline in demo mode — send a message below to explore how it works.`
                : "Hey there! You're in demo mode — no microphone or models are connected. Send a message below to explore your voice pipeline.",
            timestamp: Date.now(),
          });
          later(() => {
            if (turn.current === 0) setState("listening");
          }, 900);
        }, 380);
        return;
      }

      const connectAttempt = async (
        targetAgentName: string,
        allowAutoFallback: boolean,
      ): Promise<void> => {
        abort.current = new AbortController();
        const lk = await import("livekit-client");
        if (generation.current !== gen) return;

        let serverUrl = "";
        let participantToken = "";
        let roomLabel = "";

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
          serverUrl = details.serverUrl;
          participantToken = details.participantToken;
          roomLabel =
            (details as { roomName?: string }).roomName || "cloud-room";
        } else {
          let resolved = false;
          try {
            const response = await fetch("/api/sessions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...(accessToken
                  ? { Authorization: `Bearer ${accessToken}` }
                  : {}),
              },
              body: JSON.stringify({
                config,
                agent_name: targetAgentName,
              }),
              signal: abort.current.signal,
            });
            if (response.ok) {
              const data = await response.json();
              serverUrl = data.server_url;
              participantToken = data.participant_token;
              roomLabel = data.room_name;
              resolved = true;
            } else if (response.status !== 404 && response.status !== 405) {
              const data = await response.json();
              const sessionCreds = readSessionBrowserCreds();
              if (!sessionCreds) {
                throw new Error(
                  typeof data.detail === "string"
                    ? data.detail
                    : data.detail?.message ||
                        "The token service is unavailable. Start the Python API.",
                );
              }
            }
          } catch (fetchErr) {
            if (!readSessionBrowserCreds()) throw fetchErr;
          }

          if (!resolved) {
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
            serverUrl = browserSession.server_url;
            participantToken = browserSession.participant_token;
            roomLabel = browserSession.room_name;
          }
        }

        if (generation.current !== gen) return;

        const room = new lk.Room({
          adaptiveStream: true,
          dynacast: true,
          audioCaptureDefaults: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        roomRef.current = room;
        let agentReady = false;
        let switchingFallback = false;

        const attachTrackElement = (track: Track) => {
          const element = track.attach();
          element.setAttribute("data-inference-audio", "true");
          element.style.display = "none";
          document.body.appendChild(element);
          audioElements.current.push(element);
          void room.startAudio().catch(() => setNeedsAudio(true));
        };

        const markReady = (participantIdentity?: string) => {
          if (!agentReady) {
            agentReady = true;
            setState((prev) => (prev === "connecting" ? "listening" : prev));
            log(
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
              validStates.includes(attrState as (typeof validStates)[number])
            ) {
              setState(attrState as AgentState);
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

        // Native LiveKit transcription stream support (works with ANY hosted Cloud Bot / Agent Builder `CA_...`!)
        room.on(
          lk.RoomEvent.TranscriptionReceived,
          (segments, participant) => {
            if (customEventsSeen.current) return;
            const isAgentSpeaker = Boolean(participant?.isAgent);
            for (const segment of segments) {
              const text = (segment.text || "").trim();
              if (!text) continue;
              if (isAgentSpeaker) {
                markReady(participant?.identity);
                if (lastUserTurnAt.current > 0) {
                  const turnLatency = Math.round(
                    Date.now() - lastUserTurnAt.current,
                  );
                  if (turnLatency > 0 && turnLatency < 30000) {
                    updateMetrics({ llm_ms: turnLatency });
                  }
                  lastUserTurnAt.current = 0;
                }
                upsertMessage({
                  id: `seg-${segment.id}`,
                  role: "assistant",
                  text,
                  timestamp: segment.firstReceivedTime || Date.now(),
                });
              } else if (!segment.final) {
                setPartial(text);
              } else {
                setPartial("");
                lastUserTurnAt.current = Date.now();
                upsertMessage({
                  id: `seg-${segment.id}`,
                  role: "user",
                  text,
                  timestamp: segment.firstReceivedTime || Date.now(),
                });
              }
            }
          },
        );

        // Optional rich Studio worker telemetry (`backend/agent.py`)
        room.on(
          lk.RoomEvent.DataReceived,
          (payload, participant, _kind, topic) => {
            if (topic !== "inference.events" || !participant?.isAgent) return;
            customEventsSeen.current = true;
            try {
              const event = JSON.parse(new TextDecoder().decode(payload));
              if (event.type === "ready") {
                markReady(participant.identity);
                setState("listening");
              }
              if (event.type === "state") {
                if (validStates.includes(event.state)) {
                  markReady(participant.identity);
                  setState(event.state);
                  log(`Agent is ${event.state}.`);
                }
              }
              if (event.type === "partial" && typeof event.text === "string")
                setPartial(event.text);
              if (
                event.type === "message" &&
                typeof event.text === "string" &&
                ["user", "assistant"].includes(event.role)
              ) {
                upsertMessage({
                  id: event.id || uid(),
                  role: event.role,
                  text: event.text,
                  timestamp: event.timestamp || Date.now(),
                  interrupted: !!event.interrupted,
                });
                if (event.role === "user") setPartial("");
              }
              if (event.type === "metrics") {
                const values: Partial<Metrics> = {};
                for (const key of Object.keys(
                  emptyMetrics,
                ) as (keyof Metrics)[]) {
                  if (
                    typeof event[key] === "number" &&
                    Number.isFinite(event[key])
                  )
                    values[key] = Math.max(0, event[key]);
                }
                updateMetrics(values);
              }
              if (event.type === "error") {
                const message =
                  typeof event.message === "string"
                    ? event.message
                    : "The voice pipeline encountered an error.";
                setError(message);
                log(message, "error");
                stop("The voice pipeline stopped after a model error.");
              }
            } catch {
              log("An unreadable room event was ignored.", "warning");
            }
          },
        );

        room.on(
          lk.RoomEvent.ParticipantAttributesChanged,
          (attributes, participant) => {
            if (participant.isAgent && attributes["lk.agent.state"]) {
              const nextState = attributes["lk.agent.state"];
              if (
                validStates.includes(nextState as (typeof validStates)[number])
              ) {
                markReady(participant.identity);
                setState(nextState as AgentState);
              }
            }
          },
        );

        room.on(lk.RoomEvent.AudioPlaybackStatusChanged, () =>
          setNeedsAudio(!room.canPlaybackAudio),
        );
        room.on(lk.RoomEvent.Reconnecting, () => {
          setState("reconnecting");
          log("Connection interrupted. Reconnecting…", "warning");
        });
        room.on(lk.RoomEvent.Reconnected, () => {
          setState("listening");
          log("Room connection restored.", "success");
        });
        room.on(lk.RoomEvent.ParticipantDisconnected, (participant) => {
          if (participant.isAgent && running.current && !switchingFallback) {
            setError(
              "The agent left the room. Start another session when ready.",
            );
            stop("Agent disconnected.");
          }
        });
        room.on(lk.RoomEvent.Disconnected, () => {
          if (running.current && !switchingFallback) {
            stop("Room connection closed.");
          }
        });

        log(
          `Connecting to room ${roomLabel}${targetAgentName ? ` → dispatching ${targetAgentName}` : " → automatic cloud dispatch"}…`,
        );
        await room.connect(serverUrl, participantToken);
        if (generation.current !== gen) {
          await room.disconnect();
          return;
        }
        connected.current = true;
        log("WebRTC room connected.", "success");

        // Check if the Cloud Agent already joined during the handshake!
        for (const remote of room.remoteParticipants.values()) {
          if (remote.isAgent) {
            markReady(remote.identity);
            const attrState = remote.attributes?.["lk.agent.state"];
            if (
              attrState &&
              validStates.includes(attrState as (typeof validStates)[number])
            ) {
              setState(attrState as AgentState);
            }
            for (const pub of remote.audioTrackPublications.values()) {
              if (pub.track) attachTrackElement(pub.track);
            }
          }
        }

        // Enable microphone cleanly — if blocked (e.g. iframe preview or no mic plugged in), stay live for audio playback + text chat!
        if (typeof navigator.mediaDevices?.getUserMedia === "function") {
          try {
            await room.localParticipant.setMicrophoneEnabled(true);
            log("Microphone enabled and streaming.");
          } catch (micErr) {
            setMuted(true);
            const name = micErr instanceof Error ? micErr.name : "";
            log(
              name === "NotAllowedError"
                ? "Microphone blocked by browser/iframe — connected in listen + live text chat mode (open in a standalone browser tab for voice mic)."
                : "No microphone detected — connected in listen + live text chat mode.",
              "warning",
            );
          }
        } else {
          setMuted(true);
          log(
            "Browser microphone unavailable — connected in listen + live text chat mode.",
            "warning",
          );
        }

        void room.startAudio().catch(() => setNeedsAudio(true));

        if (allowAutoFallback && targetAgentName) {
          later(() => {
            if (!agentReady && running.current && generation.current === gen) {
              switchingFallback = true;
              log(
                `No explicit worker answered "${targetAgentName}" in 7s — automatically switching to LiveKit Cloud automatic dispatch…`,
                "warning",
              );
              detachAudio();
              roomRef.current = null;
              void room.disconnect().finally(() => {
                if (running.current && generation.current === gen) {
                  void connectAttempt("", false).catch((err: unknown) => {
                    const msg =
                      err instanceof Error
                        ? err.message
                        : "Automatic dispatch retry failed.";
                    setError(msg);
                    log(msg, "error");
                    stop("Could not reach Cloud agent.");
                  });
                }
              });
            }
          }, 7000);
          return;
        }

        later(() => {
          if (!agentReady) {
            setError(
              `No agent joined the room. Verify your bot (${botSettings.botUrl}) is deployed and running in LiveKit Cloud, or run python -m backend.agent dev locally.`,
            );
            stop("Timed out waiting for the LiveKit agent.");
          }
        }, 20000);
      };

      try {
        const primaryTarget = resolveDispatchAgentName(botSettings);
        const allowFallback =
          botSettings.dispatchMode === "cloud-bot" && Boolean(primaryTarget);
        await connectAttempt(primaryTarget, allowFallback);
      } catch (caught) {
        if (generation.current !== gen) return;
        const issue =
          caught instanceof Error
            ? caught
            : new Error("Unable to start the live session.");
        setError(issue.message);
        log(issue.message, "error");
        stop("Session could not be started.");
      }
    },
    [config, botSettings, detachAudio, log, upsertMessage, updateMetrics, stop],
  );

  const sendText = useCallback(
    async (text: string) => {
      const value = text.trim();
      if (
        !value ||
        !running.current ||
        state === "connecting" ||
        state === "thinking" ||
        state === "reconnecting"
      )
        return false;
      if (value.length > 2000) {
        setError("Messages can be up to 2,000 characters.");
        return false;
      }
      lastUserTurnAt.current = Date.now();
      upsertMessage({
        id: uid(),
        role: "user",
        text: value,
        timestamp: Date.now(),
        pending: sessionMode.current === "live",
      });
      if (sessionMode.current === "demo") {
        const currentTurn = ++turn.current;
        const gen = generation.current;
        setState("thinking");
        log("Demo turn queued — generating scripted response.");
        const isRealtime = sessionConfig.current.pipeline === "realtime";
        const replyTimer = setTimeout(() => {
          if (
            generation.current !== gen ||
            turn.current !== currentTurn ||
            !running.current
          )
            return;
          updateMetrics(
            isRealtime
              ? {
                  transcription_ms: 95,
                  endpointing_ms: 140,
                  llm_ms: 195,
                  tts_ms: 0,
                  tokens: 52,
                }
              : {
                  transcription_ms: 142,
                  endpointing_ms: 180,
                  llm_ms: 218,
                  tts_ms: 164,
                  tokens: 46,
                },
          );
          upsertMessage({
            id: uid(),
            role: "assistant",
            text: demoReply(value, sessionConfig.current),
            timestamp: Date.now(),
          });
          setState("speaking");
          log(
            "Scripted demo response delivered. Metrics are illustrative.",
            "success",
          );
          const idleTimer = setTimeout(() => {
            if (
              generation.current === gen &&
              turn.current === currentTurn &&
              running.current
            )
              setState("listening");
          }, 1100);
          timers.current.push(idleTimer);
        }, 900);
        timers.current.push(replyTimer);
        return true;
      }
      try {
        await roomRef.current?.localParticipant.sendText(value, {
          topic: "lk.chat",
        });
        log("Text message sent to LiveKit bot (lk.chat).");
        return true;
      } catch {
        setError("Your message could not be sent. Check the room connection.");
        log("Text message failed to send.", "error");
        return false;
      }
    },
    [state, upsertMessage, log, updateMetrics],
  );

  const toggleMute = useCallback(async () => {
    if (!roomRef.current || sessionMode.current !== "live") return;
    try {
      const enabled = roomRef.current.localParticipant.isMicrophoneEnabled;
      await roomRef.current.localParticipant.setMicrophoneEnabled(!enabled);
      setMuted(enabled);
      log(enabled ? "Microphone muted." : "Microphone unmuted.");
    } catch {
      setError(
        "Microphone access could not be changed. Allow microphone permissions in your browser (or open in a full tab).",
      );
    }
  }, [log]);

  const enableAudio = useCallback(async () => {
    try {
      await roomRef.current?.startAudio();
      setNeedsAudio(false);
    } catch {
      setError(
        "Your browser blocked audio. Check this site’s audio permissions.",
      );
    }
  }, []);

  return {
    state,
    mode,
    active,
    messages,
    metrics,
    logs,
    elapsed,
    muted,
    error,
    partial,
    needsAudio,
    history,
    start,
    stop,
    sendText,
    toggleMute,
    enableAudio,
    clearError: () => setError(""),
    clearHistory: () => setHistory([]),
    deleteHistory: (id: string) =>
      setHistory((current) => current.filter((item) => item.id !== id)),
  };
}

export type AgentSessionController = ReturnType<typeof useAgentSession>;
