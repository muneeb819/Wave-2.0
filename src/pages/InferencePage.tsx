import {
  Copy,
  ExternalLink,
  LockKeyhole,
  Mic,
  RotateCcw,
} from "lucide-react";
import {
  FeatureRow,
  ModelCard,
  Pipeline,
  PipelineCapabilitiesBar,
  RealtimeModelGrid,
} from "../components";
import { Playground } from "../Playground";
import type {
  Config,
  ModelKind,
  PipelineType,
  SessionMode,
  TurnDetectionMode,
} from "../types";
import type { AgentSessionController } from "../useAgentSession";

export function InferencePage({
  config,
  session,
  selectedMode,
  setSelectedMode,
  isEmbeddedIframe,
  standaloneUrl,
  activeAgentId,
  activeProjectId,
  onCopy,
  onChangePipeline,
  onConfigureModel,
  onOpenConnect,
  onOpenRealtimeModal,
  onResetDefaults,
  onChangeConfig,
  onSetConfig,
  onToggleCapability,
  onChangeTurnDetection,
  onOpenPromptModal,
  onOpenVoiceModal,
  onOpenKeytermsModal,
  onOpenAgentCode,
  onStart,
  onNotify,
}: {
  config: Config;
  session: AgentSessionController;
  selectedMode: SessionMode;
  setSelectedMode: (mode: SessionMode) => void;
  isEmbeddedIframe: boolean;
  standaloneUrl: string;
  activeAgentId: string;
  activeProjectId: string;
  onCopy: (value: string, label?: string) => void;
  onChangePipeline: (pipeline: PipelineType) => void;
  onConfigureModel: (kind: ModelKind | "realtime") => void;
  onOpenConnect: () => void;
  onOpenRealtimeModal: () => void;
  onResetDefaults: () => void;
  onChangeConfig: (kind: ModelKind | "language", value: string) => void;
  onSetConfig: (updater: (current: Config) => Config) => void;
  onToggleCapability: (
    field: "noise_cancellation" | "expressive" | "preemptive_generation",
  ) => void;
  onChangeTurnDetection: (mode: TurnDetectionMode) => void;
  onOpenPromptModal: () => void;
  onOpenVoiceModal: () => void;
  onOpenKeytermsModal: () => void;
  onOpenAgentCode: () => void;
  onStart: (mode?: SessionMode) => void;
  onNotify: (message: string) => void;
}) {
  return (
    <div className="inference-page page-enter">
      {isEmbeddedIframe && (
        <div
          className="new-tab-mic-banner"
          role="region"
          aria-label="Chrome microphone access"
        >
          <div className="new-tab-mic-copy">
            <Mic />
            <div>
              <strong>
                Embedded preview restricts Chrome microphone permissions.
              </strong>
              <span>
                Open this session in a standalone Chrome browser tab for full
                two-way voice audio with <code>{activeAgentId}</code>.
              </span>
            </div>
          </div>
          <div className="new-tab-mic-actions">
            <button
              type="button"
              className="button secondary small-button"
              onClick={() =>
                onCopy(
                  standaloneUrl,
                  "Chrome tab link copied! Paste it into a new Chrome tab.",
                )
              }
            >
              <Copy />
              Copy link
            </button>
            <a
              href={standaloneUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button primary small-button"
            >
              Open in New Chrome Tab
              <ExternalLink />
            </a>
          </div>
        </div>
      )}

      <Pipeline
        config={config}
        state={session.state}
        demo={session.mode === "demo"}
        disabled={session.active}
        onPipelineChange={onChangePipeline}
        onConfigure={onConfigureModel}
        onConnect={onOpenConnect}
        onRealtime={onOpenRealtimeModal}
      />

      <div className="section-heading">
        <div>
          <h2>
            Make it your own
            <span className="model-count-badge">
              {config.pipeline === "realtime" ? "Speech-to-speech" : "3 models"}
            </span>
          </h2>
          <p>
            {config.pipeline === "realtime"
              ? "Direct audio-in to audio-out intelligence powered by LiveKit Inference."
              : "A purpose-built model for every step of the conversation."}
          </p>
        </div>
        <button
          className="text-button reset-defaults"
          onClick={onResetDefaults}
          disabled={session.active}
        >
          <RotateCcw />
          Reset defaults
        </button>
      </div>

      {config.pipeline === "realtime" ? (
        <RealtimeModelGrid
          config={config}
          disabled={session.active}
          onModelChange={(modelId) =>
            onSetConfig((current) => ({ ...current, realtime_model: modelId }))
          }
          onVoiceChange={(voiceId) =>
            onSetConfig((current) => ({ ...current, realtime_voice: voiceId }))
          }
          onLanguageChange={(language) =>
            onSetConfig((current) => ({ ...current, language }))
          }
          onNoiseToggle={() => onToggleCapability("noise_cancellation")}
          onPrompt={onOpenPromptModal}
        />
      ) : (
        <div className="model-grid">
          {(["stt", "llm", "tts"] as const).map((kind) => (
            <ModelCard
              key={kind}
              kind={kind}
              config={config}
              disabled={session.active}
              onChange={onChangeConfig}
              onPrompt={onOpenPromptModal}
              onVoice={onOpenVoiceModal}
            />
          ))}
        </div>
      )}

      <PipelineCapabilitiesBar
        config={config}
        disabled={session.active}
        onTurnDetectionChange={onChangeTurnDetection}
        onToggle={onToggleCapability}
        onKeyterms={onOpenKeytermsModal}
      />

      {session.active && (
        <p className="config-locked">
          <LockKeyhole />
          Model settings are locked during a session. End it to make changes.
        </p>
      )}

      <div className="playground-section-heading">
        <span className="eyebrow">FROM CONFIGURATION TO CONVERSATION</span>
        <span className="session-hint">
          {selectedMode === "demo" ? (
            <>
              <span className="amber-dot" />
              Switch to <strong>Live</strong> to talk directly with{" "}
              <code>{activeAgentId}</code>.
            </>
          ) : (
            <>
              <span className="teal-dot status-dot" />
              Live target: <code>{activeAgentId}</code> ({activeProjectId})
            </>
          )}
        </span>
      </div>

      <Playground
        config={config}
        session={session}
        selectedMode={selectedMode}
        setSelectedMode={setSelectedMode}
        onStart={onStart}
        onCode={onOpenAgentCode}
        onToast={onNotify}
      />
      <FeatureRow />
    </div>
  );
}
