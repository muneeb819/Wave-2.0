import type { RefObject } from "react";
import { Activity, AlertCircle, ArrowRight, Mic, Volume2, X } from "lucide-react";
import { ChatAvatar, Equalizer, IntroMic } from "../components";
import type { SessionMode } from "../types";
import type { AgentSessionController } from "../useAgentSession";

export function PlaygroundViewport({
  tab,
  session,
  selectedMode,
  stage,
  scrollRef,
  onStart,
}: {
  tab: "conversation" | "events";
  session: AgentSessionController;
  selectedMode: SessionMode;
  stage: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  onStart: (mode?: SessionMode) => void;
}) {
  return (
    <>
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
                    ? "Joining your room and dispatching the LiveKit agent worker."
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
    </>
  );
}
