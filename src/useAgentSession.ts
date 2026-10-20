import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import { emptyMetrics, getModel, uid } from "./types";
import type {
  AgentState,
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
    return "Hey! Good to meet you. This is a local demo of your voice agent. What would you like to know about the inference pipeline?";
  if (/weather|time|news|today/.test(lower))
    return "I'm a local demo, so I can't check live information. Connect LiveKit Cloud and start the Python worker to ask your actual agent. You can customize its behavior in the system instructions.";
  if (/code|python|build|start|connect|setup/.test(lower))
    return "Add your LiveKit Cloud credentials to .env.local, start the API and Python agent worker, then switch this playground to Live. The Get code button exports your current model configuration as a runnable Python agent.";
  if (/voice|fish|speech|sound/.test(lower))
    return `Your text-to-speech model is ${getModel("tts", config.tts).name} from Fish Audio. In Live mode it streams the agent's reply as audio. You can use the configured voice or add your own Fish Audio voice ID.`;
  if (/model|pipeline|inference|work|latency|livekit/.test(lower))
    return `In a live session, ${getModel("stt", config.stt).name} transcribes your speech, ${getModel("llm", config.llm).name} generates a reply, and ${getModel("tts", config.tts).name} turns it into audio. LiveKit Inference connects all three with one set of Cloud credentials.`;
  return "That's a good prompt for your agent. This demo uses scripted replies rather than a live language model. Switch to Live once your Cloud credentials and Python worker are ready to get a real, spoken response.";
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

export function useAgentSession(config: Config) {
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

  const addMessage = useCallback((message: Message) => {
    setMessages((current) => {
      if (current.some((item) => item.id === message.id)) return current;
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

  const stop = useCallback(
    (reason?: string) => {
      if (!running.current) return;
      running.current = false;
      generation.current += 1;
      abort.current?.abort();
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        room.removeAllListeners();
        void room.disconnect();
      }
      audioElements.current.forEach((element) => element.remove());
      audioElements.current = [];
      setState("ended");
      setPartial("");
      setNeedsAudio(false);
      const duration = Math.max(
        0,
        Math.floor((Date.now() - startedAt.current) / 1000),
      );
      setElapsed(duration);
      if (connected.current) {
        const entry: HistoryEntry = {
          id: uid(),
          mode: sessionMode.current,
          startedAt: startedAt.current,
          duration,
          config: { ...sessionConfig.current },
          messages: [...messagesRef.current],
          metrics: { ...metricsRef.current },
        };
        setHistory((current) => [entry, ...current].slice(0, 20));
      }
      connected.current = false;
      log(
        reason || "Session ended. Microphone and room disconnected.",
        reason ? "warning" : "info",
      );
    },
    [log],
  );

  useEffect(
    () => () => {
      running.current = false;
      generation.current += 1;
      abort.current?.abort();
      timers.current.forEach(clearTimeout);
      void roomRef.current?.disconnect();
      audioElements.current.forEach((element) => element.remove());
    },
    [],
  );

  const start = useCallback(
    async (selectedMode: SessionMode, accessToken = "") => {
      if (running.current) return;
      running.current = true;
      connected.current = false;
      const gen = ++generation.current;
      turn.current = 0;
      sessionMode.current = selectedMode;
      sessionConfig.current = { ...config };
      startedAt.current = Date.now();
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
          log("Simulated pipeline ready.", "success");
          addMessage({
            id: uid(),
            role: "assistant",
            text: "Hey there! You're in demo mode — no microphone or models are connected. Send a message below to explore your voice pipeline.",
            timestamp: Date.now(),
          });
        }, 650);
        later(() => {
          if (turn.current === 0) setState("listening");
        }, 1700);
        return;
      }

      log("Requesting a short-lived room token…");
      try {
        if (!navigator.mediaDevices?.getUserMedia)
          throw new Error(
            "Microphone access requires HTTPS and a supported browser.",
          );
        abort.current = new AbortController();
        const response = await fetch("/api/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ config }),
          signal: abort.current.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            typeof data.detail === "string"
              ? data.detail
              : data.detail?.message ||
                  "The token service is unavailable. Start the Python API.",
          );
        if (generation.current !== gen) return;
        const {
          Room: LiveKitRoom,
          RoomEvent,
          Track,
        } = await import("livekit-client");
        if (generation.current !== gen) return;
        const room = new LiveKitRoom({
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
        const markReady = () => {
          if (!agentReady) {
            agentReady = true;
            log("LiveKit agent joined. Voice pipeline is ready.", "success");
          }
        };
        room.on(
          RoomEvent.TrackSubscribed,
          (track, _publication, participant) => {
            if (track.kind === Track.Kind.Audio && participant.isAgent) {
              const element = track.attach();
              element.setAttribute("data-inference-audio", "true");
              element.style.display = "none";
              document.body.appendChild(element);
              audioElements.current.push(element);
              void room.startAudio().catch(() => setNeedsAudio(true));
            }
          },
        );
        room.on(
          RoomEvent.DataReceived,
          (payload, participant, _kind, topic) => {
            if (topic !== "inference.events" || !participant?.isAgent) return;
            try {
              const event = JSON.parse(new TextDecoder().decode(payload));
              if (event.type === "ready") {
                markReady();
                setState("listening");
              }
              if (event.type === "state") {
                if (validStates.includes(event.state)) {
                  markReady();
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
                addMessage({
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
          RoomEvent.ParticipantAttributesChanged,
          (attributes, participant) => {
            if (participant.isAgent && attributes["lk.agent.state"]) {
              const nextState = attributes["lk.agent.state"];
              if (
                validStates.includes(nextState as (typeof validStates)[number])
              ) {
                markReady();
                setState(nextState as AgentState);
              }
            }
          },
        );
        room.on(RoomEvent.AudioPlaybackStatusChanged, () =>
          setNeedsAudio(!room.canPlaybackAudio),
        );
        room.on(RoomEvent.Reconnecting, () => {
          setState("reconnecting");
          log("Connection interrupted. Reconnecting…", "warning");
        });
        room.on(RoomEvent.Reconnected, () => {
          setState("listening");
          log("Room connection restored.", "success");
        });
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (participant.isAgent && running.current) {
            setError(
              "The agent disconnected. Check the Python worker logs, then start another session.",
            );
            stop("Agent disconnected.");
          }
        });
        room.on(RoomEvent.Disconnected, () => {
          if (running.current) stop("Room connection closed.");
        });
        log(`Connecting to room ${data.room_name}…`);
        await room.connect(data.server_url, data.participant_token);
        if (generation.current !== gen) {
          await room.disconnect();
          return;
        }
        connected.current = true;
        log("WebRTC room connected.", "success");
        await room.localParticipant.setMicrophoneEnabled(true);
        if (generation.current !== gen) {
          await room.disconnect();
          return;
        }
        log("Microphone enabled. Waiting for the Python agent…");
        void room.startAudio().catch(() => setNeedsAudio(true));
        later(() => {
          if (!agentReady) {
            setError(
              "No agent joined. Run python -m backend.agent dev with the same LiveKit project and dispatch name: inference-studio.",
            );
            stop("Timed out waiting for the Python worker.");
          }
        }, 25000);
      } catch (caught) {
        if (generation.current !== gen) return;
        const issue =
          caught instanceof Error
            ? caught
            : new Error("Unable to start the voice session.");
        const message =
          issue.name === "NotAllowedError"
            ? "Microphone permission was denied. Allow microphone access in your browser and try again."
            : issue.name === "NotFoundError"
              ? "No microphone was found. Connect an audio input device and try again."
              : issue.message;
        setError(message);
        log(message, "error");
        stop("Session could not be started.");
      }
    },
    [config, log, addMessage, updateMetrics, stop],
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
      addMessage({
        id: uid(),
        role: "user",
        text: value,
        timestamp: Date.now(),
        pending: sessionMode.current === "live",
      });
      if (sessionMode.current === "demo") {
        const gen = generation.current;
        const currentTurn = ++turn.current;
        setState("thinking");
        log("Simulated STT → LLM → TTS request.");
        const replyTimer = setTimeout(() => {
          if (
            generation.current !== gen ||
            currentTurn !== turn.current ||
            !running.current
          )
            return;
          updateMetrics({
            transcription_ms: 94,
            endpointing_ms: 122,
            llm_ms: 218,
            tts_ms: 146,
            tokens: 128,
          });
          addMessage({
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
        log("Text message sent to agent.");
        return true;
      } catch {
        setError("Your message could not be sent. Check the room connection.");
        log("Text message failed to send.", "error");
        return false;
      }
    },
    [state, addMessage, log, updateMetrics],
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
        "Microphone access could not be changed. Check your browser permissions.",
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
