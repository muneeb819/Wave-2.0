import {
  ChevronDown,
  ChevronRight,
  Globe2,
  Headphones,
  Radio,
  Settings2,
  ShieldCheck,
  Sparkles,
  Volume2,
} from "lucide-react";
import { catalog, getModel } from "../types";
import type { Config } from "../types";
import { ProviderMark } from "./ProviderMark";

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
      <section className="model-card panel model-realtime" id="model-card-realtime">
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
              {catalog.languages.find((item) => item.id === config.language)?.name}
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
          <button className="text-button" onClick={onPrompt} disabled={disabled}>
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
              {catalog.realtime_voices.find((v) => v.id === config.realtime_voice)
                ?.name ?? config.realtime_voice}
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
