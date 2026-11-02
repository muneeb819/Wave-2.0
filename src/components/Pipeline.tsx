import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  Braces,
  Cloud,
  Radio,
  ShieldCheck,
  Sparkles,
  UserRound,
  Volume2,
  Waves,
} from "lucide-react";
import { getModel } from "../types";
import type { AgentState, Config, ModelKind, PipelineType } from "../types";
import { LiveKitLogo } from "./LiveKitLogo";

const WIRE_PATHS = [
  ["stt", "M606 128H638Q664 128 664 102V65Q664 39 690 39H774"],
  ["llm", "M606 128H638Q664 128 664 109Q664 96 682 96H774"],
  ["tts", "M606 128H638Q664 128 664 140Q664 153 682 153H774"],
  ["realtime", "M606 128H638Q664 128 664 154V184Q664 210 690 210H774"],
] as const;

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
              <filter id="wire-glow" x="-50%" y="-50%" width="200%" height="200%">
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
                <path d="m1 1 3 2-3 2" fill="none" stroke="#626b70" strokeWidth=".8" />
              </marker>
              <marker
                id="arrow-teal"
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
              >
                <path d="m1 1 3 2-3 2" fill="none" stroke="#46c6cc" strokeWidth=".8" />
              </marker>
            </defs>
            <path
              d="M147 128H218 M346 128H427"
              className="neutral-wire"
              markerStart="url(#arrow-gray)"
              markerEnd="url(#arrow-gray)"
            />
            {WIRE_PATHS.map(([kind, path]) => {
              const wireActive = kind === "realtime" ? isRealtime : !isRealtime;
              const wireSelected =
                kind === currentKind || (kind === "realtime" && isRealtime);
              return (
                <g
                  key={kind}
                  className={`${wireSelected ? "selected-wire" : ""} ${!wireActive ? "alternative-wire" : ""}`}
                >
                  {wireActive && (
                    <path d={path} className="glow-wire" filter="url(#wire-glow)" />
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
                <span className="branch-name">{getModel(kind, config[kind]).name}</span>
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
