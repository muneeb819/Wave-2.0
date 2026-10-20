import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  Cpu,
  Fish,
  Globe2,
  Headphones,
  LockKeyhole,
  Mic,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Volume2,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { catalog, getModel } from "./types";
import type { AgentState, Config, ModelKind } from "./types";

export function LiveKitLogo({ small = false }: { small?: boolean }) {
  return (
    <span
      className={`livekit-logo ${small ? "small" : ""}`}
      aria-label="Wave 2.0"
    >
      <img src="/wave2.0.png" alt="Wave 2.0" className="wave2-logo-image" />
      {!small && <span>Wave 2.0</span>}
    </span>
  );
}

export function ProviderMark({ mark }: { mark: string }) {
  if (mark === "xai")
    return (
      <span className="provider-mark xai-mark" aria-hidden="true">
        xAI
      </span>
    );
  if (mark === "google")
    return (
      <span className="provider-mark google-mark" aria-hidden="true">
        G
      </span>
    );
  if (mark === "fish")
    return (
      <span className="provider-mark fish-mark">
        <Fish aria-hidden="true" />
      </span>
    );
  if (mark === "deepgram")
    return (
      <span className="provider-mark deepgram-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M5 4h7a8 8 0 1 1 0 16H5V9h7a3 3 0 0 1 0 6H9"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path d="M3 4h3" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      </span>
    );
  if (mark === "assembly")
    return (
      <span className="provider-mark assembly-mark" aria-hidden="true">
        A
      </span>
    );
  return (
    <span className="provider-mark openai-mark">
      <Sparkles aria-hidden="true" />
    </span>
  );
}

export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  size = "",
}: {
  title: string;
  eyebrow?: string;
  children: ReactNode;
  onClose: () => void;
  size?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = setTimeout(
      () =>
        ref.current
          ?.querySelector<HTMLElement>(
            "button, input, textarea, select, a[href]",
          )
          ?.focus(),
      0,
    );
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
      if (event.key === "Tab") {
        const nodes = Array.from(
          ref.current?.querySelectorAll<HTMLElement>(
            "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]",
          ) || [],
        );
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = original;
      document.removeEventListener("keydown", handler);
      previousFocus?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className={`modal ${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={ref}
      >
        <header className="modal-header">
          <div>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export function CodeBlock({
  code,
  lineNumbers = false,
  compact = false,
}: {
  code: string;
  lineNumbers?: boolean;
  compact?: boolean;
}) {
  const token =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*|\b(?:from|import|async|await|def|if|as|return)\b|\b(?:AgentSession|AgentServer|Agent|STT|LLM|TTS|TurnHandlingOptions)\b)/g;
  return (
    <pre className={`code-block ${compact ? "compact" : ""}`}>
      <code>
        {code.split("\n").map((line, index) => (
          <span className="code-line" key={index}>
            {lineNumbers && <span className="line-number">{index + 1}</span>}
            <span>
              {line.split(token).map((part, i) => {
                const type = /^['"]/.test(part)
                  ? "string"
                  : part.startsWith("#")
                    ? "comment"
                    : /^(from|import|async|await|def|if|as|return)$/.test(part)
                      ? "keyword"
                      : /^(AgentSession|AgentServer|Agent|STT|LLM|TTS|TurnHandlingOptions)$/.test(
                            part,
                          )
                        ? "class"
                        : "";
                return type ? (
                  <span className={`token-${type}`} key={i}>
                    {part}
                  </span>
                ) : (
                  part
                );
              })}
              {!line && " "}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}

export function Pipeline({
  config,
  state,
  demo,
  onConfigure,
  onConnect,
  onRealtime,
}: {
  config: Config;
  state: AgentState;
  demo: boolean;
  onConfigure: (kind: ModelKind) => void;
  onConnect: () => void;
  onRealtime: () => void;
}) {
  const running = !["idle", "ended"].includes(state);
  const currentKind: ModelKind | undefined =
    state === "listening"
      ? "stt"
      : state === "thinking"
        ? "llm"
        : state === "speaking"
          ? "tts"
          : undefined;
  return (
    <section
      className="pipeline-card panel"
      aria-label="LiveKit Inference architecture"
    >
      <div className="panel-heading">
        <h2>
          <span className="heading-icon">
            <Braces />
          </span>
          Inference pipeline <span className="tiny-tag">VOICE AGENT</span>
        </h2>
        <span className={`pipeline-indicator ${running ? "running" : ""}`}>
          <span className="status-dot" />
          {running
            ? demo
              ? "Demo pipeline active"
              : "Session active"
            : "Ready to connect"}
        </span>
      </div>
      <div className={`pipeline-canvas ${running ? "is-running" : ""}`}>
        <div className="pipeline-map">
          <svg
            className="pipeline-wires"
            viewBox="0 0 1000 260"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <defs>
              <filter
                id="wire-glow"
                x="-50%"
                y="-50%"
                width="200%"
                height="200%"
              >
                <feGaussianBlur stdDeviation="2" />
              </filter>
              <marker
                id="arrow-gray"
                markerWidth="5"
                markerHeight="6"
                refX="4"
                refY="3"
                orient="auto-start-reverse"
              >
                <path
                  d="m1 1 3 2-3 2"
                  fill="none"
                  stroke="#626b70"
                  strokeWidth=".8"
                />
              </marker>
              <marker
                id="arrow-teal"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path
                  d="m1 1 3 2-3 2"
                  fill="none"
                  stroke="#46c6cc"
                  strokeWidth=".8"
                />
              </marker>
            </defs>
            <path
              d="M147 128H218 M346 128H427"
              className="neutral-wire"
              markerStart="url(#arrow-gray)"
              markerEnd="url(#arrow-gray)"
            />
            {[
              ["stt", "M606 128H638Q664 128 664 102V65Q664 39 690 39H774"],
              ["llm", "M606 128H638Q664 128 664 109Q664 96 682 96H774"],
              ["tts", "M606 128H638Q664 128 664 140Q664 153 682 153H774"],
              [
                "realtime",
                "M606 128H638Q664 128 664 154V184Q664 210 690 210H774",
              ],
            ].map(([kind, path]) => (
              <g
                key={kind}
                className={`${kind === currentKind ? "selected-wire" : ""} ${kind === "realtime" ? "alternative-wire" : ""}`}
              >
                {kind !== "realtime" && (
                  <path
                    d={path}
                    className="glow-wire"
                    filter="url(#wire-glow)"
                  />
                )}
                <path
                  d={path}
                  className="teal-wire"
                  markerEnd={
                    kind !== "realtime" ? "url(#arrow-teal)" : undefined
                  }
                />
                {running && currentKind === kind && (
                  <path d={path} className="flow-pulse" />
                )}
              </g>
            ))}
            <circle cx="614" cy="128" r="2.4" fill="#59d6da" />
          </svg>
          <div className="pipeline-node user-node">
            <span className="node-mini-icon">
              <UserRound />
            </span>
            <span>You</span>
            <span className="node-caption">Audio + text</span>
          </div>
          <div className="pipeline-node agent-node">
            <span className="node-mini-icon">
              <AudioLines />
            </span>
            <span>Agent</span>
            <span className="node-caption">Python SDK</span>
          </div>
          <button
            className="pipeline-node inference-node"
            onClick={onConnect}
            title="Configure your LiveKit connection"
          >
            <span className="inference-symbol">
              <LiveKitLogo small />
            </span>
            <span>
              LiveKit <strong>Inference</strong>
            </span>
            <span className="inference-label">ONE UNIFIED API</span>
          </button>
          {(["stt", "llm", "tts"] as const).map((kind, index) => (
            <button
              key={kind}
              className={`pipeline-node branch-node branch-${kind} ${currentKind === kind && running ? "node-active" : ""}`}
              style={{ top: `${(17 + 57 * index) / 2.6}%` }}
              onClick={() => onConfigure(kind)}
              title={`Configure ${kind.toUpperCase()}`}
            >
              <span className={`branch-icon ${kind}`}>
                {kind === "stt" ? (
                  <Waves />
                ) : kind === "llm" ? (
                  <Sparkles />
                ) : (
                  <Volume2 />
                )}
              </span>
              <span className="branch-copy">
                <span className="branch-kind">{kind.toUpperCase()}</span>
                <span className="branch-name">
                  {getModel(kind, config[kind]).name}
                </span>
              </span>
              <span className="branch-dot" />
            </button>
          ))}
          <button
            className="pipeline-node branch-node branch-realtime"
            onClick={onRealtime}
          >
            <span className="branch-icon">
              <Radio />
            </span>
            <span className="branch-copy">
              <span className="branch-kind">REALTIME</span>
              <span className="branch-name">Speech to speech</span>
            </span>
            <ArrowUpRight />
          </button>
          <span className="diagram-note">Your stack, unified.</span>
        </div>
      </div>
      <div className="pipeline-footer">
        <span>
          <ShieldCheck />
          Server-side credentials
        </span>
        <span>
          <Cloud />
          One connection. Every model.
        </span>
        <span className="pipeline-scroll-hint">
          Swipe to explore
          <ArrowRight />
        </span>
        <span className="pipeline-footer-end">
          <span className="mini-square" />
          STT + LLM + TTS
        </span>
      </div>
    </section>
  );
}

const cardMeta = {
  stt: {
    title: "Speech to text",
    description: "Turn voice into understanding.",
    Icon: Waves,
    number: "01",
    caption: "TRANSCRIBE",
  },
  llm: {
    title: "Language model",
    description: "The intelligence behind every reply.",
    Icon: Sparkles,
    number: "02",
    caption: "REASON",
  },
  tts: {
    title: "Text to speech",
    description: "Give your agent a voice.",
    Icon: Volume2,
    number: "03",
    caption: "SPEAK",
  },
};

export function ModelCard({
  kind,
  config,
  disabled,
  onChange,
  onPrompt,
  onVoice,
}: {
  kind: ModelKind;
  config: Config;
  disabled: boolean;
  onChange: (kind: ModelKind | "language", value: string) => void;
  onPrompt: () => void;
  onVoice: () => void;
}) {
  const meta = cardMeta[kind];
  const model = getModel(kind, config[kind]);
  return (
    <section
      className={`model-card panel model-${kind}`}
      id={`model-card-${kind}`}
    >
      <div className="model-card-head">
        <span className={`model-type-icon ${kind}`}>
          <meta.Icon />
        </span>
        <span className="model-step">
          {meta.number}
          <span>/ {meta.caption}</span>
        </span>
      </div>
      <h3>{meta.title}</h3>
      <p className="model-description">{meta.description}</p>
      <label className="model-select" htmlFor={`${kind}-model`}>
        <ProviderMark mark={model.mark} />
        <span className="model-select-copy">
          <span className="provider-name">{model.provider}</span>
          <strong>{model.name}</strong>
        </span>
        <ChevronDown />
        <select
          id={`${kind}-model`}
          aria-label={kind === "llm" ? "Language model" : `${meta.title} model`}
          value={config[kind]}
          onChange={(event) => onChange(kind, event.target.value)}
          disabled={disabled}
        >
          {catalog[kind].map((item) => (
            <option key={item.id} value={item.id}>
              {item.provider} · {item.name}
            </option>
          ))}
        </select>
      </label>
      <div className="model-option-row">
        {kind === "stt" ? (
          <>
            <span className="model-option-label">
              <Globe2 />
              Language
            </span>
            <label className="language-select">
              <span>
                {
                  catalog.languages.find((item) => item.id === config.language)
                    ?.name
                }
              </span>
              <ChevronDown />
              <select
                value={config.language}
                aria-label="Transcription language"
                disabled={disabled}
                onChange={(event) => onChange("language", event.target.value)}
              >
                {catalog.languages
                  .filter((item) => model.languages?.includes(item.id))
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : kind === "llm" ? (
          <>
            <span className="model-option-label">
              <Settings2 />
              System instructions
            </span>
            <button
              className="text-button"
              onClick={onPrompt}
              disabled={disabled}
            >
              Customize
              <ChevronRight />
            </button>
          </>
        ) : (
          <>
            <span className="model-option-label">
              <Headphones />
              Voice
            </span>
            <button
              className="text-button"
              onClick={onVoice}
              disabled={disabled}
            >
              {config.voice === catalog.defaults.voice
                ? "Default voice"
                : "Custom voice"}
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <div className="model-card-foot">
        <span className="model-id" title={model.id}>
          {model.id}
        </span>
        <span className="model-tag">{model.tag}</span>
      </div>
    </section>
  );
}

export function Equalizer({
  active = false,
  small = false,
}: {
  active?: boolean;
  small?: boolean;
}) {
  return (
    <div
      className={`equalizer ${active ? "animated" : ""} ${small ? "small" : ""}`}
      aria-hidden="true"
    >
      {[12, 22, 37, 54, 33, 64, 44, 76, 50, 67, 38, 57, 31, 45, 24, 14, 9].map(
        (height, i) => (
          <span
            key={i}
            style={{
              height: `${height}%`,
              animationDelay: `${i * -0.13}s`,
              animationDuration: `${0.65 + (i % 4) * 0.17}s`,
            }}
          />
        ),
      )}
    </div>
  );
}

export function Pill({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`pill ${tone}`}>
      <span className="status-dot" />
      {children}
    </span>
  );
}

export function CopyButton({
  onClick,
  label = "Copy",
  copied = false,
}: {
  onClick: () => void;
  label?: string;
  copied?: boolean;
}) {
  return (
    <button
      className="icon-button copy-button"
      onClick={onClick}
      title={label}
      aria-label={label}
    >
      {copied ? <Check /> : <Copy />}
    </button>
  );
}

export function SetupSteps({ children }: { children?: ReactNode }) {
  return (
    <div className="setup-steps">
      <div className="setup-step">
        <span className="step-number">1</span>
        <div>
          <h3>Add your Cloud credentials</h3>
          <p>
            Copy <code>.env.example</code> to <code>.env.local</code> in the
            project folder. Get your URL, API key, and secret from{" "}
            <a
              href="https://cloud.livekit.io/"
              target="_blank"
              rel="noreferrer"
            >
              LiveKit Cloud <ArrowUpRight />
            </a>
            .
          </p>
          <div className="setup-command">
            <LockKeyhole />
            <code>LIVEKIT_URL · LIVEKIT_API_KEY · LIVEKIT_API_SECRET</code>
          </div>
        </div>
      </div>
      <div className="setup-step">
        <span className="step-number">2</span>
        <div>
          <h3>Run your Python agent</h3>
          <p>
            In a separate terminal, start the worker with the same Cloud
            project.
          </p>
          <div className="setup-command">
            <span className="terminal-dollar">$</span>
            <code>python -m backend.agent dev</code>
          </div>
        </div>
      </div>
      <div className="setup-step">
        <span className="step-number">3</span>
        <div>
          <h3>Start a real conversation</h3>
          <p>
            Check the connection below, select <strong>Live</strong> in the
            playground, and allow microphone access. The worker must be running.
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon = "session",
  title,
  children,
}: {
  icon?: "session" | "search";
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        {icon === "session" ? <AudioLines /> : <Braces />}
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

export function FeatureRow() {
  return (
    <div className="feature-row">
      <span>
        <Zap />
        Built for realtime
      </span>
      <i />
      <span>
        <LockKeyhole />
        Keys stay on your server
      </span>
      <i />
      <span>
        <Cpu />
        Your models. Your stack.
      </span>
      <a
        href="https://docs.livekit.io/agents/models/inference/"
        target="_blank"
        rel="noreferrer"
      >
        Explore the documentation
        <ArrowRight />
      </a>
    </div>
  );
}

export function ChatAvatar({ role }: { role: MessageRole }) {
  return (
    <span className={`chat-avatar ${role}`}>
      {role === "assistant" ? <AudioLines /> : <UserRound />}
    </span>
  );
}
type MessageRole = "user" | "assistant";

export function IntroMic() {
  return (
    <div className="intro-mic">
      <div className="intro-mic-ring" />
      <Mic />
      <span className="intro-spark spark-one" />
      <span className="intro-spark spark-two" />
    </div>
  );
}
