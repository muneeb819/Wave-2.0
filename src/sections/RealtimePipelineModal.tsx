import {
  ArrowRight,
  AudioLines,
  Mic,
  Radio,
  Sparkles,
} from "lucide-react";
import { Modal } from "../components";
import { catalog, getModel } from "../types";
import type { Config, PipelineType } from "../types";

export function RealtimePipelineModal({
  config,
  sessionActive,
  onModelChange,
  onChangePipeline,
  onNotify,
  onClose,
}: {
  config: Config;
  sessionActive: boolean;
  onModelChange: (modelId: string) => void;
  onChangePipeline: (pipeline: PipelineType) => void;
  onNotify: (message: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Speech-to-speech Realtime pipeline."
      eyebrow="REALTIME MODELS · LIVEKIT INFERENCE"
      onClose={onClose}
    >
      <div className="realtime-explainer">
        <span className="realtime-modal-icon">
          <Radio />
        </span>
        <p>
          Realtime models combine speech understanding, reasoning, and audio
          generation directly in a single speech-to-speech model through LiveKit
          Inference — with no extra API keys required.
        </p>
        <div className="realtime-flow">
          <span>
            <Mic />
            Audio in
          </span>
          <ArrowRight />
          <strong>
            <Sparkles />
            {getModel("realtime", config.realtime_model).name}
          </strong>
          <ArrowRight />
          <span>
            <AudioLines />
            Audio out
          </span>
        </div>
        <label
          className="model-select realtime-modal-select"
          htmlFor="modal-realtime-model"
        >
          <span className="model-select-copy">
            <span className="provider-name">Selected Realtime model</span>
            <strong>
              {getModel("realtime", config.realtime_model).provider} ·{" "}
              {getModel("realtime", config.realtime_model).name}
            </strong>
          </span>
          <select
            id="modal-realtime-model"
            aria-label="Modal realtime model"
            value={config.realtime_model}
            disabled={sessionActive}
            onChange={(event) => onModelChange(event.target.value)}
          >
            {catalog.realtime.map((item) => (
              <option key={item.id} value={item.id}>
                {item.provider} · {item.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="modal-footer">
        {config.pipeline === "realtime" ? (
          <>
            <button
              className="button secondary"
              disabled={sessionActive}
              onClick={() => {
                onChangePipeline("stt-llm-tts");
                onClose();
                onNotify("Switched to STT → LLM → TTS pipeline.");
              }}
            >
              Switch to STT-LLM-TTS
            </button>
            <button className="button primary" onClick={onClose}>
              Keep Realtime active
            </button>
          </>
        ) : (
          <>
            <button className="button secondary" onClick={onClose}>
              Keep STT-LLM-TTS pipeline
            </button>
            <button
              className="button primary"
              disabled={sessionActive}
              onClick={() => {
                onChangePipeline("realtime");
                onClose();
                onNotify(
                  `Switched to ${getModel("realtime", config.realtime_model).name} realtime pipeline.`,
                );
              }}
            >
              Enable Realtime pipeline
              <ArrowRight />
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
