import {
  ChevronDown,
  ShieldCheck,
  Tag,
  WandSparkles,
  Waves,
  Zap,
} from "lucide-react";
import type { Config, TurnDetectionMode } from "../types";

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
    <div className="capabilities-bar panel" aria-label="Voice pipeline options">
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
