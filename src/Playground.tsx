import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Braces,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  Code2,
  CornerDownLeft,
  MessageSquare,
  Mic,
  MicOff,
  Play,
  Send,
  Square,
  Volume2,
  X,
} from "lucide-react";
import type { Config, SessionMode } from "./types";
import { copyText, downloadJSON, formatTime } from "./types";
import type { AgentSessionController } from "./useAgentSession";
import {
  ChatAvatar,
  CodeBlock,
  CopyButton,
  Equalizer,
  IntroMic,
} from "./components";
import { snippet } from "./code";

const stateLabels = {
  idle: "Ready when you are",
  ended: "Session ended",
  connecting: "Connecting your agent",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  reconnecting: "Reconnecting",
};

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
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [session.messages, session.logs, session.partial, tab]);
  useEffect(() => {
    if (
      session.active &&
      session.state === "listening" &&
      !document.querySelector('[role="dialog"]')
    )
      inputRef.current?.focus({ preventScroll: true });
  }, [session.active, session.state]);
  const canSend =
    session.active &&
    !["connecting", "thinking", "reconnecting"].includes(session.state);
  const estimate =
    session.metrics.llm_ms !== null &&
    session.metrics.tts_ms !== null &&
    session.metrics.endpointing_ms !== null
      ? session.metrics.llm_ms +
        session.metrics.tts_ms +
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
            : stateLabels[session.state]
      : stateLabels[session.state];
  async function copy() {
    try {
      await copyText(snippet(config));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onToast("Python configuration copied.");
    } catch (error) {
      onToast((error as Error).message);
    }
  }

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
              <span className="tester-idle-dot" />
            )}
          </div>
        </div>
        <div
          className="conversation-area"
          ref={scrollRef}
          aria-live="polite"
          aria-relevant="additions text"
        >
          {tab === "events" ? (
            <div className="event-list">
              {session.logs.length ? (
                session.logs.map((event) => (
                  <div className={`event-row ${event.kind}`} key={event.id}>
                    <time>
                      {new Date(event.timestamp).toLocaleTimeString("en-GB", {
                        hour12: false,
                      })}
                    </time>
                    <span className="event-dot" />
                    <span>{event.message}</span>
                  </div>
                ))
              ) : (
                <div className="events-empty">
                  <Activity />
                  <span>Every step, in real time.</span>
                  <p>Start a session to see connection and pipeline events.</p>
                </div>
              )}
            </div>
          ) : session.messages.length === 0 ? (
            <div className="conversation-intro">
              {session.state === "connecting" ? (
                <>
                  <div className="connecting-animation">
                    <Equalizer active />
                  </div>
                  <h3>
                    Connecting your voice stack
                    <span className="loading-dots">…</span>
                  </h3>
                  <p>
                    {selectedMode === "live"
                      ? "Joining your room and waiting for the Python worker."
                      : "Preparing a local, text-only demonstration."}
                  </p>
                </>
              ) : (
                <>
                  <IntroMic />
                  <h3>A conversation starts here.</h3>
                  <p>
                    Try the text demo, or connect LiveKit Cloud
                    <br className="desktop-break" /> to hear your agent come to
                    life.
                  </p>
                  <button
                    className="intro-demo-button"
                    onClick={() => onStart("demo")}
                  >
                    Try a demo
                    <ArrowRight />
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="message-list">
              {session.messages.map((message) => (
                <div
                  className={`chat-message ${message.role}`}
                  key={message.id}
                >
                  <ChatAvatar role={message.role} />
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>
                        {message.role === "assistant" ? "Your agent" : "You"}
                      </strong>
                      {session.mode === "demo" &&
                        message.role === "assistant" && (
                          <span className="demo-message-tag">DEMO</span>
                        )}
                      <time>
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p>{message.text}</p>
                    {message.interrupted && (
                      <span className="interrupted-label">Interrupted</span>
                    )}
                  </div>
                </div>
              ))}
              {session.partial && (
                <div className="interim-caption">
                  <Mic />
                  {session.partial}
                  <span className="typing-caret" />
                </div>
              )}
              {session.state === "thinking" && (
                <div className="thinking-indicator">
                  <ChatAvatar role="assistant" />
                  <span />
                  <span />
                  <span />
                </div>
              )}
            </div>
          )}
        </div>
        {session.active && (
          <div className="agent-status-bar">
            <Equalizer
              small
              active={
                session.state === "speaking" || session.state === "thinking"
              }
            />
            <span>{stage}</span>
            {session.mode === "demo" && (
              <span className="simulated-label">TEXT-ONLY DEMO</span>
            )}
            {session.needsAudio && (
              <button
                className="text-button"
                onClick={() => void session.enableAudio()}
              >
                <Volume2 />
                Enable audio
              </button>
            )}
          </div>
        )}
        {session.error && (
          <div className="inline-error" role="alert">
            <AlertCircle />
            <span>{session.error}</span>
            <button
              className="icon-button"
              onClick={session.clearError}
              aria-label="Dismiss error"
            >
              <X />
            </button>
          </div>
        )}
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
              : "Live mode · Real microphone and model requests"}
          </span>
          {session.messages.length > 0 && (
            <button
              className="icon-button"
              title="Export transcript"
              aria-label="Export current transcript"
              onClick={() =>
                downloadJSON("inference-transcript.json", {
                  mode: session.mode,
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
            <span title="Transcription delay, LLM time to first token, TTS time to first byte, and an estimated sum of end-of-turn + LLM + TTS delays.">
              <CircleHelp />
            </span>
          </div>
          <div className="metric-values">
            {[
              ["Transcription", session.metrics.transcription_ms],
              ["LLM first token", session.metrics.llm_ms],
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
      <section className="code-panel panel" aria-label="Python quick start">
        <div className="panel-heading">
          <h2>
            <span className="heading-icon">
              <Code2 />
            </span>
            Your stack in code
          </h2>
          <div className="code-toolbar">
            <span className="language-pill">
              <span />
              Python
            </span>
            <CopyButton onClick={() => void copy()} copied={copied} />
          </div>
        </div>
        <div className="code-filename">
          <Braces />
          <span>agent.py</span>
          <span className="code-sync-indicator">
            <Check />
            Synced with your models
          </span>
        </div>
        <CodeBlock code={snippet(config)} lineNumbers compact />
        <div className="code-panel-note">
          <ShieldNote />
          <p>
            One set of Cloud credentials.
            <br />
            <span>No separate provider API keys.</span>
          </p>
        </div>
        <button className="code-panel-footer" onClick={onCode}>
          <span>Get the complete agent</span>
          <ChevronRight />
        </button>
      </section>
    </div>
  );
}

function ShieldNote() {
  return (
    <div className="shield-note">
      <Cloud />
      <span className="shield-tiny-check">
        <Check />
      </span>
    </div>
  );
}
