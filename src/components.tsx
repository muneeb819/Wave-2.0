import { useEffect, useId, useRef, useState } from "react";
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
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Terminal,
  UserRound,
  Volume2,
  WandSparkles,
  Waves,
  X,
  Zap,
} from "lucide-react";
import { catalog, defaultConfig, getModel } from "./types";
import type {
  AgentState,
  Config,
  ModelKind,
  PipelineType,
  TurnDetectionMode,
} from "./types";

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
  if (mark === "cartesia")
    return (
      <span className="provider-mark cartesia-mark" aria-hidden="true">
        C
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
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*|\/\/[^\n]*|\b(?:from|import|export|default|const|let|async|await|def|class|if|else|as|return|new)\b|\b(?:AgentSession|AgentServer|Agent|STT|LLM|TTS|RealtimeModel|DuplexModel|TurnDetector|STTContextOptions|TurnHandlingOptions)\b)/g;
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
                  : part.startsWith("#") || part.startsWith("//")
                    ? "comment"
                    : /^(from|import|export|default|const|let|async|await|def|class|if|else|as|return|new)$/.test(
                          part,
                        )
                      ? "keyword"
                      : /^(AgentSession|AgentServer|Agent|STT|LLM|TTS|RealtimeModel|DuplexModel|TurnDetector|STTContextOptions|TurnHandlingOptions)$/.test(
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
  disabled,
  onPipelineChange,
  onConfigure,
  onConnect,
  onRealtime,
}: {
  config: Config;
  state: AgentState;
  demo: boolean;
  disabled: boolean;
  onPipelineChange: (pipeline: PipelineType) => void;
  onConfigure: (kind: ModelKind | "realtime") => void;
  onConnect: () => void;
  onRealtime: () => void;
}) {
  const running = !["idle", "ended"].includes(state);
  const isRealtime = config.pipeline === "realtime";
  const currentKind: ModelKind | "realtime" | undefined = isRealtime
    ? running
      ? "realtime"
      : undefined
    : state === "listening"
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
      <div className="panel-heading pipeline-heading">
        <h2>
          <span className="heading-icon">
            <Braces />
          </span>
          Inference pipeline <span className="tiny-tag">VOICE AGENT</span>
        </h2>
        <div className="pipeline-header-controls">
          <div className="mode-switch pipeline-switch" aria-label="Pipeline type">
            <button
              className={!isRealtime ? "selected live-mode" : ""}
              onClick={() => onPipelineChange("stt-llm-tts")}
              disabled={disabled}
              aria-pressed={!isRealtime}
            >
              <Waves />
              STT-LLM-TTS pipeline
            </button>
            <button
              className={isRealtime ? "selected live-mode" : ""}
              onClick={() => onPipelineChange("realtime")}
              disabled={disabled}
              aria-pressed={isRealtime}
            >
              <Radio />
              Realtime model
            </button>
          </div>
          <span className={`pipeline-indicator ${running ? "running" : ""}`}>
            <span className="status-dot" />
            {running
              ? demo
                ? "Demo pipeline active"
                : "Session active"
              : "Ready to connect"}
          </span>
        </div>
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
            {(
              [
                ["stt", "M606 128H638Q664 128 664 102V65Q664 39 690 39H774"],
                ["llm", "M606 128H638Q664 128 664 109Q664 96 682 96H774"],
                ["tts", "M606 128H638Q664 128 664 140Q664 153 682 153H774"],
                [
                  "realtime",
                  "M606 128H638Q664 128 664 154V184Q664 210 690 210H774",
                ],
              ] as const
            ).map(([kind, path]) => {
              const wireActive =
                kind === "realtime" ? isRealtime : !isRealtime;
              const wireSelected =
                kind === currentKind || (kind === "realtime" && isRealtime);
              return (
                <g
                  key={kind}
                  className={`${wireSelected ? "selected-wire" : ""} ${!wireActive ? "alternative-wire" : ""}`}
                >
                  {wireActive && (
                    <path
                      d={path}
                      className="glow-wire"
                      filter="url(#wire-glow)"
                    />
                  )}
                  <path
                    d={path}
                    className="teal-wire"
                    markerEnd={wireActive ? "url(#arrow-teal)" : undefined}
                  />
                  {running && currentKind === kind && (
                    <path d={path} className="flow-pulse" />
                  )}
                </g>
              );
            })}
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
            <span className="node-caption">Python + Node SDK</span>
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
              className={`pipeline-node branch-node branch-${kind} ${isRealtime ? "branch-muted" : ""} ${currentKind === kind && running ? "node-active" : ""}`}
              style={{ top: `${(17 + 57 * index) / 2.6}%` }}
              onClick={() => {
                if (isRealtime && !disabled) onPipelineChange("stt-llm-tts");
                onConfigure(kind);
              }}
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
            className={`pipeline-node branch-node branch-realtime ${isRealtime ? "branch-realtime-active" : ""} ${isRealtime && running ? "node-active" : ""}`}
            onClick={onRealtime}
            title="Realtime speech-to-speech pipeline"
          >
            <span className="branch-icon realtime-icon">
              <Radio />
            </span>
            <span className="branch-copy">
              <span className="branch-kind">REALTIME</span>
              <span className="branch-name">
                {isRealtime
                  ? getModel("realtime", config.realtime_model).name
                  : "Speech to speech"}
              </span>
            </span>
            {isRealtime ? <span className="branch-dot" /> : <ArrowUpRight />}
          </button>
          <span className="diagram-note">Your stack, unified.</span>
        </div>
      </div>
      <div className="pipeline-footer">
        <span>
          <ShieldCheck />
          {config.noise_cancellation
            ? "ai-coustics QUAIL VF-S active"
            : "Self-hosted audio mode"}
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
          {isRealtime
            ? `REALTIME · ${getModel("realtime", config.realtime_model).name.toUpperCase()}`
            : "STT + LLM + TTS · TURNDETECTOR"}
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
              {config.voice === defaultConfig.voice
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

export function RealtimeModelGrid({
  config,
  disabled,
  onModelChange,
  onVoiceChange,
  onLanguageChange,
  onNoiseToggle,
  onPrompt,
}: {
  config: Config;
  disabled: boolean;
  onModelChange: (modelId: string) => void;
  onVoiceChange: (voiceId: string) => void;
  onLanguageChange: (language: string) => void;
  onNoiseToggle: () => void;
  onPrompt: () => void;
}) {
  const model = getModel("realtime", config.realtime_model);
  return (
    <div className="model-grid">
      <section
        className="model-card panel model-realtime"
        id="model-card-realtime"
      >
        <div className="model-card-head">
          <span className="model-type-icon llm">
            <Radio />
          </span>
          <span className="model-step">
            01<span>/ SPEECH TO SPEECH</span>
          </span>
        </div>
        <h3>Realtime model</h3>
        <p className="model-description">
          Direct end-to-end audio understanding and speech.
        </p>
        <label className="model-select" htmlFor="realtime-model">
          <ProviderMark mark={model.mark} />
          <span className="model-select-copy">
            <span className="provider-name">{model.provider}</span>
            <strong>{model.name}</strong>
          </span>
          <ChevronDown />
          <select
            id="realtime-model"
            aria-label="Realtime speech model"
            value={config.realtime_model}
            onChange={(event) => onModelChange(event.target.value)}
            disabled={disabled}
          >
            {catalog.realtime.map((item) => (
              <option key={item.id} value={item.id}>
                {item.provider} · {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="model-option-row">
          <span className="model-option-label">
            <Globe2 />
            Response language
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
              onChange={(event) => onLanguageChange(event.target.value)}
            >
              {catalog.languages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="model-card-foot">
          <span className="model-id" title={model.id}>
            {model.id}
          </span>
          <span className="model-tag">{model.tag}</span>
        </div>
      </section>

      <section className="model-card panel model-llm">
        <div className="model-card-head">
          <span className="model-type-icon llm">
            <Sparkles />
          </span>
          <span className="model-step">
            02<span>/ INSTRUCTIONS</span>
          </span>
        </div>
        <h3>Agent behavior</h3>
        <p className="model-description">
          Persona, guardrails, and spoken response style.
        </p>
        <button
          type="button"
          className="model-select realtime-action-box"
          onClick={onPrompt}
          disabled={disabled}
        >
          <span className="provider-mark openai-mark">
            <Settings2 aria-hidden="true" />
          </span>
          <span className="model-select-copy">
            <span className="provider-name">System prompt</span>
            <strong>{config.instructions.slice(0, 42)}…</strong>
          </span>
          <ChevronRight />
        </button>
        <div className="model-option-row">
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
        </div>
        <div className="model-card-foot">
          <span className="model-id">
            {config.instructions.length} chars · @function_tool ready
          </span>
          <span className="model-tag">PERSONA</span>
        </div>
      </section>

      <section className="model-card panel model-tts">
        <div className="model-card-head">
          <span className="model-type-icon tts">
            <Volume2 />
          </span>
          <span className="model-step">
            03<span>/ VOICE & AUDIO</span>
          </span>
        </div>
        <h3>Voice & audio input</h3>
        <p className="model-description">
          Native speech voice and Cloud audio enhancement.
        </p>
        <label className="model-select" htmlFor="realtime-voice">
          <span className="provider-mark fish-mark">
            <Headphones aria-hidden="true" />
          </span>
          <span className="model-select-copy">
            <span className="provider-name">Realtime voice</span>
            <strong>
              {catalog.realtime_voices.find(
                (v) => v.id === config.realtime_voice,
              )?.name ?? config.realtime_voice}
            </strong>
          </span>
          <ChevronDown />
          <select
            id="realtime-voice"
            aria-label="Realtime voice"
            value={config.realtime_voice}
            onChange={(event) => onVoiceChange(event.target.value)}
            disabled={disabled}
          >
            {catalog.realtime_voices.map((voiceItem) => (
              <option key={voiceItem.id} value={voiceItem.id}>
                {voiceItem.name}
              </option>
            ))}
          </select>
        </label>
        <div className="model-option-row">
          <span className="model-option-label">
            <ShieldCheck />
            ai-coustics QUAIL VF-S
          </span>
          <button
            className="text-button"
            onClick={onNoiseToggle}
            disabled={disabled}
          >
            {config.noise_cancellation ? "Enabled" : "Disabled (Self-host)"}
            <ChevronRight />
          </button>
        </div>
        <div className="model-card-foot">
          <span className="model-id">voice: {config.realtime_voice}</span>
          <span className="model-tag">
            {config.noise_cancellation ? "ENHANCED" : "RAW AUDIO"}
          </span>
        </div>
      </section>
    </div>
  );
}

export function PipelineCapabilitiesBar({
  config,
  disabled,
  onTurnDetectionChange,
  onToggle,
  onKeyterms,
}: {
  config: Config;
  disabled: boolean;
  onTurnDetectionChange: (mode: TurnDetectionMode) => void;
  onToggle: (
    field: "noise_cancellation" | "expressive" | "preemptive_generation",
  ) => void;
  onKeyterms: () => void;
}) {
  return (
    <div
      className="capabilities-bar panel"
      aria-label="Voice pipeline options"
    >
      {config.pipeline === "stt-llm-tts" && (
        <div className="capability-item">
          <span className="capability-label">
            <Waves />
            Turn detection
          </span>
          <label className="language-select capability-select">
            <span>
              {config.stt.includes("flux") || config.turn_detection === "stt"
                ? "Native STT"
                : config.turn_detection === "vad"
                  ? "Silero VAD"
                  : "LiveKit TurnDetector"}
            </span>
            <ChevronDown />
            <select
              aria-label="Turn detection mode"
              value={config.turn_detection}
              disabled={disabled || config.stt.includes("flux")}
              onChange={(event) =>
                onTurnDetectionChange(event.target.value as TurnDetectionMode)
              }
            >
              <option value="turn_detector">LiveKit TurnDetector</option>
              <option value="vad">Local Silero VAD</option>
              <option value="stt">Native STT end-of-turn</option>
            </select>
          </label>
        </div>
      )}

      <button
        type="button"
        className={`capability-chip ${config.noise_cancellation ? "active" : ""}`}
        disabled={disabled}
        onClick={() => onToggle("noise_cancellation")}
        aria-pressed={config.noise_cancellation}
        title="ai-coustics QUAIL VF-S audio enhancement. Turn off when self-hosting LiveKit Server."
      >
        <ShieldCheck />
        <span>Noise cancellation</span>
        <strong>{config.noise_cancellation ? "QUAIL VF-S" : "Off"}</strong>
      </button>

      {config.pipeline === "stt-llm-tts" && (
        <>
          <button
            type="button"
            className={`capability-chip ${config.expressive ? "active" : ""}`}
            disabled={disabled}
            onClick={() => onToggle("expressive")}
            aria-pressed={config.expressive}
            title="Inject TTS provider emotion and pacing tags while keeping transcripts clean"
          >
            <WandSparkles />
            <span>Expressive TTS</span>
            <strong>{config.expressive ? "On" : "Off"}</strong>
          </button>

          <button
            type="button"
            className={`capability-chip ${config.preemptive_generation ? "active" : ""}`}
            disabled={disabled}
            onClick={() => onToggle("preemptive_generation")}
            aria-pressed={config.preemptive_generation}
            title="Start LLM generation while awaiting final turn confirmation"
          >
            <Zap />
            <span>Preemptive LLM</span>
            <strong>{config.preemptive_generation ? "On" : "Off"}</strong>
          </button>

          <button
            type="button"
            className="capability-chip active"
            disabled={disabled}
            onClick={onKeyterms}
          >
            <Tag />
            <span>Keyterms</span>
            <strong>{config.keyterms.length} terms</strong>
          </button>
        </>
      )}
    </div>
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

const CLI_INSTALL_COMMANDS = {
  macos: "brew install livekit-cli && lk cloud auth",
  linux: "curl -sSL https://get.livekit.io/cli | bash && lk cloud auth",
  windows: "winget install LiveKit.LiveKitCLI && lk cloud auth",
  source: "go install github.com/livekit/livekit-cli/v2/cmd/lk@latest",
} as const;

export function SetupSteps({ children }: { children?: ReactNode }) {
  const [osTab, setOsTab] = useState<keyof typeof CLI_INSTALL_COMMANDS>("macos");
  const [sdkTab, setSdkTab] = useState<"python" | "node">("python");

  return (
    <div className="setup-steps">
      <div className="setup-step">
        <span className="step-number">1</span>
        <div>
          <h3>Install LiveKit CLI & add Cloud credentials</h3>
          <p>
            Link your project with <code>lk cloud auth</code> or copy{" "}
            <code>.env.example</code> to <code>.env.local</code> using keys from{" "}
            <a
              href="https://cloud.livekit.io/"
              target="_blank"
              rel="noreferrer"
            >
              LiveKit Cloud <ArrowUpRight />
            </a>
            .
          </p>
          <div className="mini-tab-row" role="tablist" aria-label="CLI platform">
            {(
              [
                ["macos", "macOS"],
                ["linux", "Linux"],
                ["windows", "Windows"],
                ["source", "From Source"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={osTab === key}
                className={osTab === key ? "active" : ""}
                onClick={() => setOsTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="setup-command">
            <Terminal />
            <code>{CLI_INSTALL_COMMANDS[osTab]}</code>
          </div>
          <div className="setup-command">
            <LockKeyhole />
            <code>LIVEKIT_URL · LIVEKIT_API_KEY · LIVEKIT_API_SECRET</code>
          </div>
        </div>
      </div>

      <div className="setup-step">
        <span className="step-number">2</span>
        <div>
          <h3>Install dependencies & run your agent worker</h3>
          <p>
            Use either the included <strong>Python (`uv`)</strong> worker or{" "}
            <strong>Node.js (`pnpm`)</strong> starter project with the same
            Cloud project.
          </p>
          <div
            className="mini-tab-row"
            role="tablist"
            aria-label="Starter language"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sdkTab === "python"}
              className={sdkTab === "python" ? "active" : ""}
              onClick={() => setSdkTab("python")}
            >
              Python (uv)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sdkTab === "node"}
              className={sdkTab === "node" ? "active" : ""}
              onClick={() => setSdkTab("node")}
            >
              Node.js (pnpm)
            </button>
          </div>
          <div className="setup-command">
            <span className="terminal-dollar">$</span>
            <code>
              {sdkTab === "python"
                ? "uv sync && python -m backend.agent dev"
                : "cd agent-node && pnpm install && pnpm run start:dev"}
            </code>
          </div>
          <div className="setup-command">
            <span className="terminal-dollar">$</span>
            <code>
              {sdkTab === "python"
                ? "lk agent init my-agent --template agent-starter-python && lk agent dev"
                : "lk agent init my-agent --template agent-starter-node && lk agent dev"}
            </code>
          </div>
        </div>
      </div>

      <div className="setup-step">
        <span className="step-number">3</span>
        <div>
          <h3>Speak to your agent or deploy to LiveKit Cloud</h3>
          <p>
            Select <strong>Live</strong> in the playground (or open the LiveKit
            Agent Console with agent name <code>my-agent</code>), test in{" "}
            <code>console</code> / <code>dev</code> / <code>start</code> modes,
            or deploy with <code>lk agent create</code>.
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}

export function StartupModesPanel({
  onCopy,
}: {
  onCopy: (command: string, label: string) => void;
}) {
  const modes = [
    {
      mode: "console",
      title: "Console mode",
      cmd: "uv run agent.py console",
      desc: "Run locally in your terminal with direct microphone/speaker I/O.",
    },
    {
      mode: "dev",
      title: "Dev mode",
      cmd: "python -m backend.agent dev",
      desc: "Hot-reload worker connected to LiveKit Cloud, Studio & Agent Console.",
    },
    {
      mode: "start",
      title: "Production start",
      cmd: "python -m backend.agent start",
      desc: "Production worker mode (`lk agent start`).",
    },
    {
      mode: "deploy",
      title: "LiveKit Cloud deploy",
      cmd: "lk agent create",
      desc: "Build the included multi-stage Dockerfile and deploy to LiveKit Cloud.",
    },
  ];
  return (
    <section className="panel preferences-panel startup-modes-panel">
      <div className="panel-heading">
        <h2>
          <Server />
          Server startup & deploy modes
        </h2>
      </div>
      <div className="startup-modes-list">
        {modes.map((item) => (
          <div className="startup-mode-item" key={item.mode}>
            <div className="startup-mode-top">
              <strong>{item.title}</strong>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onCopy(item.cmd, `Copied "${item.cmd}" to clipboard.`)
                }
              >
                <Copy />
                Copy
              </button>
            </div>
            <p>{item.desc}</p>
            <code>{item.cmd}</code>
          </div>
        ))}
      </div>
    </section>
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
        STT-LLM-TTS + Realtime S2S
      </span>
      <i />
      <span>
        <LockKeyhole />
        Keys stay on your server
      </span>
      <i />
      <span>
        <Cpu />
        Python (uv) + Node.js (pnpm)
      </span>
      <a
        href="https://docs.livekit.io/agents/start/voice-ai/"
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
