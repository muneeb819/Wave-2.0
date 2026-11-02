import { useCallback, useEffect, useRef, useState } from "react";
import type { Room } from "livekit-client";
import {
  demoMetricsFor,
  demoReply,
  loadHistory,
  persistHistory,
} from "./session/demoSimulator";
import { connectLiveRoom } from "./session/liveRoomBridge";
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
    persistHistory(history);
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

      try {
        const primaryTarget = resolveDispatchAgentName(botSettings);
        const allowFallback =
          botSettings.dispatchMode === "cloud-bot" && Boolean(primaryTarget);
        await connectLiveRoom(
          {
            gen,
            config,
            botSettings,
            accessToken,
            generationRef: generation,
            runningRef: running,
            connectedRef: connected,
            customEventsSeenRef: customEventsSeen,
            lastUserTurnAtRef: lastUserTurnAt,
            roomRef,
            abortRef: abort,
            audioElementsRef: audioElements,
            later,
            detachAudio,
            setState,
            setPartial,
            setMuted,
            setNeedsAudio,
            setError,
            log,
            upsertMessage,
            updateMetrics,
            stop,
          },
          primaryTarget,
          allowFallback,
        );
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
      ) {
        return false;
      }
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
        const replyTimer = setTimeout(() => {
          if (
            generation.current !== gen ||
            turn.current !== currentTurn ||
            !running.current
          ) {
            return;
          }
          updateMetrics(demoMetricsFor(sessionConfig.current.pipeline));
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
            ) {
              setState("listening");
            }
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
