import { useState } from "react";
import { AudioLines, Check, RotateCcw, Sparkles, Tag } from "lucide-react";
import { Modal } from "../components";
import { defaultConfig, getModel } from "../types";
import type { Config } from "../types";

export function PromptModal({
  initialPrompt,
  sessionActive,
  onSave,
  onClose,
}: {
  initialPrompt: string;
  sessionActive: boolean;
  onSave: (instructions: string) => void;
  onClose: () => void;
}) {
  const [promptDraft, setPromptDraft] = useState(initialPrompt);
  return (
    <Modal
      title="Shape your agent’s personality."
      eyebrow="LANGUAGE MODEL · SYSTEM INSTRUCTIONS"
      onClose={onClose}
    >
      <p className="modal-description">
        Tell your agent how to respond. Clear, conversational instructions work
        best for voice.
      </p>
      <label className="prompt-label" htmlFor="system-prompt">
        System instructions
        <span>{promptDraft.length.toLocaleString()} / 8,000</span>
      </label>
      <textarea
        className="prompt-textarea"
        id="system-prompt"
        aria-label="System instructions"
        value={promptDraft}
        maxLength={8000}
        rows={9}
        onChange={(event) => setPromptDraft(event.target.value)}
      />
      <div className="prompt-tip">
        <Sparkles />
        <span>
          Keep replies concise and avoid markdown. Your agent speaks its
          responses aloud.
        </span>
      </div>
      <div className="modal-footer">
        <button
          className="text-button"
          onClick={() => setPromptDraft(defaultConfig.instructions)}
        >
          <RotateCcw />
          Restore default
        </button>
        <button
          className="button primary"
          disabled={promptDraft.trim().length < 10 || sessionActive}
          onClick={() => onSave(promptDraft.trim())}
        >
          <Check />
          Save instructions
        </button>
      </div>
    </Modal>
  );
}

export function VoiceModal({
  config,
  sessionActive,
  onSave,
  onClose,
}: {
  config: Config;
  sessionActive: boolean;
  onSave: (voice: string) => void;
  onClose: () => void;
}) {
  const [voiceDraft, setVoiceDraft] = useState(config.voice);
  return (
    <Modal
      title="Find your agent’s voice."
      eyebrow="FISH AUDIO · VOICE SETTINGS"
      onClose={onClose}
    >
      <p className="modal-description">
        Use the reference voice, or provide another TTS voice ID.
      </p>
      <div className="voice-preview">
        <div className="voice-art">
          <AudioLines />
        </div>
        <div>
          <h3>
            {voiceDraft === defaultConfig.voice
              ? "Reference voice"
              : "Custom TTS voice"}
          </h3>
          <p>{getModel("tts", config.tts).name} · Streaming text to speech</p>
        </div>
      </div>
      <label className="prompt-label" htmlFor="voice-id">
        Voice ID
      </label>
      <input
        className="voice-id-input"
        id="voice-id"
        value={voiceDraft}
        maxLength={128}
        onChange={(event) => setVoiceDraft(event.target.value)}
        spellCheck={false}
      />
      <p className="voice-help">
        Voice IDs are provider-specific. Use a voice available through your
        selected TTS provider. Actual playback is available in a live session.
      </p>
      <div className="modal-footer">
        <button
          className="text-button"
          onClick={() => setVoiceDraft(defaultConfig.voice)}
        >
          <RotateCcw />
          Use reference voice
        </button>
        <button
          className="button primary"
          disabled={
            !/^[A-Za-z0-9_-]{1,128}$/.test(voiceDraft) || sessionActive
          }
          onClick={() => onSave(voiceDraft)}
        >
          <Check />
          Save voice
        </button>
      </div>
    </Modal>
  );
}

export function KeytermsModal({
  initialKeyterms,
  sessionActive,
  onSave,
  onClose,
}: {
  initialKeyterms: string[];
  sessionActive: boolean;
  onSave: (keyterms: string[]) => void;
  onClose: () => void;
}) {
  const [keytermsDraft, setKeytermsDraft] = useState(
    initialKeyterms.join(", "),
  );
  return (
    <Modal
      title="Boost domain vocabulary."
      eyebrow="STT CONTEXT · KEYTERMS & DETECTION"
      onClose={onClose}
    >
      <p className="modal-description">
        Bias speech recognition toward product names, brands, and technical
        jargon via <code>STTContextOptions</code>. Live keyterm detection also
        learns caller names automatically during the conversation.
      </p>
      <label className="prompt-label" htmlFor="keyterms-input">
        Comma-separated keyterms
        <span>Up to 20 terms</span>
      </label>
      <input
        className="voice-id-input"
        id="keyterms-input"
        aria-label="Keyterms list"
        value={keytermsDraft}
        onChange={(event) => setKeytermsDraft(event.target.value)}
        placeholder="LiveKit, Wave 2.0, AssemblyAI"
      />
      <p className="voice-help">
        Separate terms with commas using letters, numbers, spaces, dots, or
        hyphens.
      </p>
      <div className="modal-footer">
        <button
          className="text-button"
          onClick={() => setKeytermsDraft(defaultConfig.keyterms.join(", "))}
        >
          <RotateCcw />
          Restore defaults
        </button>
        <button
          className="button primary"
          disabled={sessionActive}
          onClick={() => {
            const parsed = keytermsDraft
              .split(",")
              .map((item) => item.trim())
              .filter((item) =>
                /^[A-Za-z0-9][A-Za-z0-9 .,'&/_-]{0,63}$/.test(item),
              )
              .slice(0, 20);
            onSave(parsed);
          }}
        >
          <Tag />
          Save keyterms
        </button>
      </div>
    </Modal>
  );
}
