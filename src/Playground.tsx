import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  AudioLines,
  CircleHelp,
  Cloud,
  CornerDownLeft,
  ExternalLink,
  MessageSquare,
  Mic,
  MicOff,
  Play,
  Send,
  Square,
} from "lucide-react";
import { getStandaloneChromeUrl } from "./browserToken";
import { useMicTester } from "./hooks/useMicTester";
import { PlaygroundCodePanel } from "./sections/PlaygroundCodePanel";
import { PlaygroundViewport } from "./sections/PlaygroundViewport";
import { downloadJSON, formatTime } from "./types";
import type { Config, SessionMode } from "./types";
import type { AgentSessionController } from "./useAgentSession";

const STATE_LABELS = {
  idle: "Ready when you are",
  ended: "Session ended",
  connecting: "Connecting your agent",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  reconnecting: "Reconnecting",
} as const;

export function Playground({
  config,
  session,
  selectedMode,
  setSelectedMode,
  onStart,
  onCode,
  onToast,
}: {
  config: Config;
  session: AgentSessionController;
  selectedMode: SessionMode;
  setSelectedMode: (mode: SessionMode) => void;
  onStart: (mode?: SessionMode) => void;
  onCode: () => void;
  onToast: (message: string) => void;
}) {
  const [tab, setTab] = useState<"conversation" | "events">("conversation");
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isEmbeddedIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const standaloneUrl = getStandaloneChromeUrl();
  const { micTesting, micLevel, micLabel, toggleMicTest } = useMicTester({
    sessionActive: session.active,
    isEmbeddedIframe,
    onToast,
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session.messages, session.logs, session.partial, tab]);

  useEffect(() => {
    if (
      session.active &&
      session.state === "listening" &&
      !document.querySelector('[role="dialog"]')
    ) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [session.active, session.state]);

  const canSend =
    session.active &&
    !["connecting", "thinking", "reconnecting"].includes(session.state);

  const estimate =
    session.metrics.llm_ms !== null &&
    session.metrics.endpointing_ms !== null &&
    (config.pipeline === "realtime" || session.metrics.tts_ms !== null)
      ? session.metrics.llm_ms +
        (session.metrics.tts_ms ?? 0) +
        session.metrics.endpointing_ms
      : null;

  const stage =
    session.mode === "demo" && session.active
      ? session.state === "speaking"
        ? "Simulated response"
        : session.state === "listening"
          ? "Ready for your message"
          : session.state === "thinking"
            ? "Simulating the pipeline"
            : STATE_LABELS[session.state]
      : STATE_LABELS[session.state];

  return (
    <div className="playground-grid">
      <section
        className="tester-panel panel"
        id="agent-playground"
        aria-label="Agent playground"
      >
        <div className="panel-heading tester-heading">
          <h2>
            <span className="heading-icon teal">
              <AudioLines />
            </span>
            Talk to your agent
          </h2>
          <div className="mode-switch" aria-label="Session mode">
            <button
              className={selectedMode === "demo" ? "selected" : ""}
              onClick={() => setSelectedMode("demo")}
              disabled={session.active}
              aria-pressed={selectedMode === "demo"}
            >
              <Play />
              Demo
            </button>
            <button
              className={selectedMode === "live" ? "selected live-mode" : ""}
              onClick={() => setSelectedMode("live")}
              disabled={session.active}
              aria-pressed={selectedMode === "live"}
            >
              <Cloud />
              Live
            </button>
          </div>
        </div>
        <div className="tester-tabs">
          <div className="inner-tabs">
            <button
              className={tab === "conversation" ? "selected" : ""}
              onClick={() => setTab("conversation")}
            >
              <MessageSquare />
              Conversation
              {session.messages.length > 0 && (
                <span>{session.messages.length}</span>
              )}
            </button>
            <button
              className={tab === "events" ? "selected" : ""}
              onClick={() => setTab("events")}
            >
              <Activity />
              Events
              {session.logs.length > 0 && <span>{session.logs.length}</span>}
            </button>
          </div>
          <div className="tester-session-state">
            {session.active ? (
              <>
                <span className="live-indicator" />
                <span>{formatTime(session.elapsed)}</span>
                <button
                  className={`icon-button ${session.muted ? "muted" : ""}`}
                  disabled={session.mode === "demo"}
                  onClick={() => void session.toggleMute()}
                  aria-label={
                    session.muted ? "Unmute microphone" : "Mute microphone"
                  }
                  title={
                    session.mode === "demo"
                      ? "Microphone is not used in demo mode"
                      : session.muted
                        ? "Unmute microphone"
                        : "Mute microphone"
                  }
                >
                  {session.muted ? <MicOff /> : <Mic />}
                </button>
                <button
                  className="icon-button end-session"
                  onClick={() => session.stop()}
                  aria-label="End session"
                  title="End session"
                >
                  <Square />
                </button>
              </>
            ) : (
              <div className="idle-mic-tools">
                <button
                  type="button"
                  className={`mic-test-btn ${micTesting ? "active" : ""}`}
                  onClick={() => void toggleMicTest()}
                  title="Test your Chrome microphone input before starting a call"
                >
                  <Mic />
                  <span>{micTesting ? "Stop mic test" : "Test mic"}</span>
                  {micTesting && (
                    <span className="mic-meter" aria-hidden="true">
                      <span style={{ width: `${Math.max(8, micLevel)}%` }} />
                    </span>
                  )}
                </button>
                {isEmbeddedIframe && (
                  <a
                    href={standaloneUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="open-tab-chip"
                    title="Open in a full standalone Chrome tab to unlock microphone permissions"
                  >
                    <span>Open in Chrome Tab</span>
                    <ExternalLink />
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
        {micTesting && micLabel && (
          <div className="mic-ready-strip">
            <Mic />
            <span>
              Chrome mic active: <strong>{micLabel}</strong> — speak now to
              check your level, then click <strong>Start session</strong>.
            </span>
          </div>
        )}
        <PlaygroundViewport
          tab={tab}
          session={session}
          selectedMode={selectedMode}
          stage={stage}
          scrollRef={scrollRef}
          onStart={onStart}
        />
        <form
          className="chat-input-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (await session.sendText(input)) setInput("");
          }}
        >
          <input
            ref={inputRef}
            aria-label="Message to your agent"
            placeholder={
              session.active
                ? "Ask your agent anything…"
                : "Start a session to send a message…"
            }
            value={input}
            maxLength={2000}
            onChange={(event) => setInput(event.target.value)}
            disabled={
              !session.active ||
              session.state === "connecting" ||
              session.state === "reconnecting"
            }
          />
          <span className="input-enter">
            <CornerDownLeft />
          </span>
          <button
            type="submit"
            aria-label="Send message"
            disabled={!canSend || !input.trim()}
          >
            <Send />
          </button>
        </form>
        <div className="tester-footnote">
          <span>
            <span
              className={`status-dot ${selectedMode === "live" ? "teal-dot" : ""}`}
            />
            {selectedMode === "demo"
              ? "Demo mode · Scripted replies · No audio captured"
              : `Live mode · ${config.pipeline === "realtime" ? "Speech-to-speech realtime" : "Chained STT → LLM → TTS"}`}
          </span>
          {session.messages.length > 0 && (
            <button
              className="icon-button"
              title="Export transcript"
              aria-label="Export current transcript"
              onClick={() =>
                downloadJSON("inference-transcript.json", {
                  mode: session.mode,
                  pipeline: config.pipeline,
                  messages: session.messages,
                  metrics: session.metrics,
                })
              }
            >
              <ArrowDownToLine />
            </button>
          )}
        </div>
        <div className="metrics-strip">
          <div className="metrics-strip-label">
            <Activity />
            {session.mode === "demo"
              ? "ILLUSTRATIVE METRICS"
              : "LIVE SDK METRICS"}
            <span title="Transcription delay, model time to first token, TTS time to first byte, and estimated end-of-turn pipeline latency.">
              <CircleHelp />
            </span>
          </div>
          <div className="metric-values">
            {[
              ["Transcription", session.metrics.transcription_ms],
              [
                config.pipeline === "realtime"
                  ? "Realtime TTFT"
                  : "LLM first token",
                session.metrics.llm_ms,
              ],
              ["TTS first byte", session.metrics.tts_ms],
              ["Pipeline estimate", estimate],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <strong>
                  {value === null ? (
                    <span className="metric-empty">—</span>
                  ) : (
                    value
                  )}
                  <small>{value !== null ? "ms" : ""}</small>
                </strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
      <PlaygroundCodePanel
        config={config}
        onCode={onCode}
        onToast={onToast}
      />
    </div>
  );
}
