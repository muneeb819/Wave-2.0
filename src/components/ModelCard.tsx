import {
  ChevronDown,
  ChevronRight,
  Globe2,
  Headphones,
  Settings2,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";
import { catalog, defaultConfig, getModel } from "../types";
import type { Config, ModelKind } from "../types";
import { ProviderMark } from "./ProviderMark";

const CARD_META = {
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
} as const;

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
  const meta = CARD_META[kind];
  const model = getModel(kind, config[kind]);
  return (
    <section className={`model-card panel model-${kind}`} id={`model-card-${kind}`}>
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
                {catalog.languages.find((item) => item.id === config.language)?.name}
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
            <button className="text-button" onClick={onPrompt} disabled={disabled}>
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
            <button className="text-button" onClick={onVoice} disabled={disabled}>
              {config.voice === defaultConfig.voice ? "Default voice" : "Custom voice"}
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
