import type {
  BotSettings,
  CloudStatus,
  Config,
  HistoryEntry,
  PipelineType,
  SessionMode,
} from "../types";
import type { AgentSessionController } from "../useAgentSession";
import { CodeExportModal } from "./CodeExportModal";
import type { CodeTab } from "./CodeExportModal";
import { ConnectBotModal } from "./ConnectBotModal";
import { KeytermsModal, PromptModal, VoiceModal } from "./ModelConfigModals";
import { RealtimePipelineModal } from "./RealtimePipelineModal";
import {
  ClearHistoryModal,
  TranscriptModal,
  WorkspaceModal,
} from "./SessionModals";
import type { StudioPage } from "./Sidebar";

export type StudioDialog =
  | "code"
  | "connect"
  | "prompt"
  | "voice"
  | "keyterms"
  | "realtime"
  | "clear-history"
  | "workspace"
  | null;

export function StudioDialogs({
  modal,
  codeTab,
  setCodeTab,
  config,
  setConfig,
  botSettings,
  setBotSettings,
  cloud,
  setCloud,
  cloudLabel,
  isLiveReady,
  activeAgentId,
  activeProjectId,
  accessToken,
  setAccessToken,
  checking,
  session,
  selectedHistory,
  onCopy,
  onNotify,
  onCheckConnection,
  onNavigate,
  onChangePipeline,
  onSetSelectedMode,
  onCloseModal,
  onCloseHistory,
}: {
  modal: StudioDialog;
  codeTab: CodeTab;
  setCodeTab: (tab: CodeTab) => void;
  config: Config;
  setConfig: (updater: (current: Config) => Config) => void;
  botSettings: BotSettings;
  setBotSettings: (updater: (prev: BotSettings) => BotSettings) => void;
  cloud: CloudStatus;
  setCloud: (next: CloudStatus) => void;
  cloudLabel: string;
  isLiveReady: boolean;
  activeAgentId: string;
  activeProjectId: string;
  accessToken: string;
  setAccessToken: (value: string) => void;
  checking: boolean;
  session: AgentSessionController;
  selectedHistory: HistoryEntry | null;
  onCopy: (value: string, label?: string) => void;
  onNotify: (message: string) => void;
  onCheckConnection: () => void;
  onNavigate: (next: StudioPage) => void;
  onChangePipeline: (pipeline: PipelineType) => void;
  onSetSelectedMode: (mode: SessionMode) => void;
  onCloseModal: () => void;
  onCloseHistory: () => void;
}) {
  return (
    <>
      {modal === "code" && (
        <CodeExportModal
          config={config}
          codeTab={codeTab}
          setCodeTab={setCodeTab}
          onCopy={onCopy}
          onNotify={onNotify}
          onClose={onCloseModal}
        />
      )}

      {modal === "connect" && (
        <ConnectBotModal
          botSettings={botSettings}
          setBotSettings={setBotSettings}
          cloud={cloud}
          cloudLabel={cloudLabel}
          isLiveReady={isLiveReady}
          activeAgentId={activeAgentId}
          activeProjectId={activeProjectId}
          accessToken={accessToken}
          setAccessToken={setAccessToken}
          checking={checking}
          onSavedCredentials={(nextStatus) => {
            setCloud(nextStatus);
            onSetSelectedMode("live");
            onCloseModal();
            onNotify(
              `Connected to ${nextStatus.server_host} · Starting Live session with ${activeAgentId}!`,
            );
            void session.start("live", accessToken);
          }}
          onCopy={onCopy}
          onCheckConnection={onCheckConnection}
          onOpenSettings={() => {
            onCloseModal();
            onNavigate("settings");
          }}
          onPrimaryAction={() => {
            onCloseModal();
            onSetSelectedMode(isLiveReady ? "live" : "demo");
            onNavigate("inference");
            if (isLiveReady && !session.active) {
              void session.start("live", accessToken);
            }
          }}
          onNotify={onNotify}
          onClose={onCloseModal}
        />
      )}

      {modal === "prompt" && (
        <PromptModal
          initialPrompt={config.instructions}
          sessionActive={session.active}
          onSave={(instructions) => {
            setConfig((current) => ({ ...current, instructions }));
            onCloseModal();
            onNotify("System instructions saved.");
          }}
          onClose={onCloseModal}
        />
      )}

      {modal === "voice" && (
        <VoiceModal
          config={config}
          sessionActive={session.active}
          onSave={(voice) => {
            setConfig((current) => ({ ...current, voice }));
            onCloseModal();
            onNotify("Voice settings saved.");
          }}
          onClose={onCloseModal}
        />
      )}

      {modal === "keyterms" && (
        <KeytermsModal
          initialKeyterms={config.keyterms}
          sessionActive={session.active}
          onSave={(keyterms) => {
            setConfig((current) => ({ ...current, keyterms }));
            onCloseModal();
            onNotify(`Saved ${keyterms.length} STT keyterms.`);
          }}
          onClose={onCloseModal}
        />
      )}

      {modal === "realtime" && (
        <RealtimePipelineModal
          config={config}
          sessionActive={session.active}
          onModelChange={(modelId) =>
            setConfig((current) => ({ ...current, realtime_model: modelId }))
          }
          onChangePipeline={onChangePipeline}
          onNotify={onNotify}
          onClose={onCloseModal}
        />
      )}

      {modal === "clear-history" && (
        <ClearHistoryModal
          historyCount={session.history.length}
          onClear={() => {
            session.clearHistory();
            onCloseModal();
            onNotify("Session history cleared.");
          }}
          onClose={onCloseModal}
        />
      )}

      {modal === "workspace" && (
        <WorkspaceModal
          activeAgentId={activeAgentId}
          activeProjectId={activeProjectId}
          isLiveReady={isLiveReady}
          cloudLabel={cloudLabel}
          onOpenSettings={() => {
            onCloseModal();
            onNavigate("settings");
          }}
          onClose={onCloseModal}
        />
      )}

      {selectedHistory && (
        <TranscriptModal
          entry={selectedHistory}
          onDelete={() => {
            session.deleteHistory(selectedHistory.id);
            onCloseHistory();
            onNotify("Session removed from history.");
          }}
          onClose={onCloseHistory}
        />
      )}
    </>
  );
}
