import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { getStandaloneChromeUrl } from "./browserToken";
import { LiveKitLogo } from "./components";
import { useCloudConnection } from "./hooks/useCloudConnection";
import { InferencePage } from "./pages/InferencePage";
import { SessionsPage } from "./pages/SessionsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { CodeTab } from "./sections/CodeExportModal";
import { PageHeader } from "./sections/PageHeader";
import { Sidebar } from "./sections/Sidebar";
import type { StudioPage } from "./sections/Sidebar";
import { StudioDialogs } from "./sections/StudioDialogs";
import type { StudioDialog } from "./sections/StudioDialogs";
import { Topbar } from "./sections/Topbar";
import {
  copyText,
  DEFAULT_CLOUD_AGENT_ID,
  DEFAULT_CLOUD_PROJECT_ID,
  defaultBotSettings,
  defaultConfig,
  getModel,
  parseCloudAgentUrl,
  readBotSettings,
  readConfig,
  saveConfig,
} from "./types";
import type {
  BotSettings,
  Config,
  HistoryEntry,
  ModelKind,
  PipelineType,
  SessionMode,
  TurnDetectionMode,
} from "./types";
import { useAgentSession } from "./useAgentSession";

export default function App() {
  const [page, setPage] = useState<StudioPage>("inference");
  const [config, setConfig] = useState<Config>(readConfig);
  const [botSettings, setBotSettings] = useState<BotSettings>(readBotSettings);
  const [selectedMode, setSelectedMode] = useState<SessionMode>(() => {
    if (
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("mode") === "live"
    ) {
      return "live";
    }
    return "demo";
  });
  const isEmbeddedIframe =
    typeof window !== "undefined" && window.self !== window.top;
  const standaloneUrl = getStandaloneChromeUrl();
  const [modal, setModal] = useState<StudioDialog>(null);
  const [codeTab, setCodeTab] = useState<CodeTab>("snippet");
  const [accessToken, setAccessToken] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<HistoryEntry | null>(
    null,
  );

  const session = useAgentSession(config, botSettings);
  const parsedBot = useMemo(
    () => parseCloudAgentUrl(botSettings.botUrl),
    [botSettings.botUrl],
  );
  const notify = useCallback((message: string) => setToast(message), []);

  const fallbackAgentId = parsedBot.agentId || DEFAULT_CLOUD_AGENT_ID;
  const { cloud, setCloud, checking, checkConnection } = useCloudConnection({
    botSettings,
    setBotSettings,
    accessToken,
    activeAgentId: fallbackAgentId,
    setSelectedMode,
    notify,
  });

  const activeAgentId =
    parsedBot.agentId || cloud.cloud_agent_id || DEFAULT_CLOUD_AGENT_ID;
  const activeProjectId =
    parsedBot.projectId || cloud.cloud_project_id || DEFAULT_CLOUD_PROJECT_ID;
  const isLiveReady = cloud.configured || Boolean(botSettings.sandboxId.trim());

  const closeModal = useCallback(() => setModal(null), []);
  const closeHistory = useCallback(() => setSelectedHistory(null), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const onStart = useCallback(
    (requestedMode?: SessionMode) => {
      if (session.active) {
        session.stop();
        return;
      }
      const mode = requestedMode || selectedMode;
      setSelectedMode(mode);
      setPage("inference");
      if (
        mode === "live" &&
        (!isLiveReady ||
          (!botSettings.sandboxId.trim() && cloud.protected && !accessToken))
      ) {
        setModal("connect");
        return;
      }
      void session.start(mode, accessToken);
    },
    [
      session.active,
      session.start,
      session.stop,
      selectedMode,
      isLiveReady,
      botSettings.sandboxId,
      cloud.protected,
      accessToken,
    ],
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key === "Enter" &&
        !modal &&
        !selectedHistory &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement).tagName,
        )
      ) {
        event.preventDefault();
        onStart();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onStart, modal, selectedHistory]);

  function navigate(next: StudioPage) {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changePipeline(pipeline: PipelineType) {
    if (!session.active) setConfig((current) => ({ ...current, pipeline }));
  }

  function changeConfig(kind: ModelKind | "language", value: string) {
    if (session.active) return;
    setConfig((current) => {
      const next = { ...current, [kind]: value };
      if (
        kind === "stt" &&
        !getModel("stt", value).languages?.includes(next.language)
      ) {
        next.language = "en";
      }
      return next;
    });
  }

  function toggleCapability(
    field: "noise_cancellation" | "expressive" | "preemptive_generation",
  ) {
    if (!session.active) {
      setConfig((current) => ({ ...current, [field]: !current[field] }));
    }
  }

  function changeTurnDetection(turn_detection: TurnDetectionMode) {
    if (!session.active) {
      setConfig((current) => ({ ...current, turn_detection }));
    }
  }

  function resetDefaults() {
    if (!session.active) {
      setConfig({ ...defaultConfig, keyterms: [...defaultConfig.keyterms] });
      setBotSettings({ ...defaultBotSettings });
      notify("Default model stack and bot link restored.");
    }
  }

  function configure(kind: ModelKind | "realtime") {
    document
      .getElementById(`model-card-${kind}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(`${kind}-model`)?.focus({ preventScroll: true });
  }

  async function copy(value: string, label = "Copied to clipboard.") {
    try {
      await copyText(value);
      notify(label);
    } catch (error) {
      notify((error as Error).message);
    }
  }

  const cloudLabel = cloud.offline
    ? "API offline"
    : botSettings.sandboxId.trim()
      ? `Sandbox · ${activeAgentId}`
      : cloud.configured
        ? `Connected · ${activeAgentId}`
        : "Cloud not connected";

  const title =
    page === "inference"
      ? "Inference"
      : page === "sessions"
        ? "Sessions"
        : "Configuration";

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        mobileOpen={mobileNav}
        activeAgentId={activeAgentId}
        activeProjectId={activeProjectId}
        botUrl={botSettings.botUrl}
        isLiveReady={isLiveReady}
        historyCount={session.history.length}
        onNavigate={navigate}
        onCloseMobile={() => setMobileNav(false)}
        onOpenConnect={() => setModal("connect")}
        onOpenWorkspace={() => setModal("workspace")}
      />

      <main className="main-shell">
        <Topbar
          title={title}
          standaloneUrl={standaloneUrl}
          activeAgentId={activeAgentId}
          botUrl={botSettings.botUrl}
          onOpenMobileNav={() => setMobileNav(true)}
          onOpenConnect={() => setModal("connect")}
        />
        <div className="main-content">
          <PageHeader
            page={page}
            title={title}
            activeAgentId={activeAgentId}
            activeProjectId={activeProjectId}
            sessionActive={session.active}
            history={session.history}
            checking={checking}
            isLiveReady={isLiveReady}
            cloudLabel={cloudLabel}
            onNavigate={navigate}
            onOpenCode={() => {
              setCodeTab("snippet");
              setModal("code");
            }}
            onStart={() => onStart()}
            onCheckConnection={() => void checkConnection(true)}
            onOpenConnect={() => setModal("connect")}
          />

          {page === "inference" && (
            <InferencePage
              config={config}
              session={session}
              selectedMode={selectedMode}
              setSelectedMode={setSelectedMode}
              isEmbeddedIframe={isEmbeddedIframe}
              standaloneUrl={standaloneUrl}
              activeAgentId={activeAgentId}
              activeProjectId={activeProjectId}
              onCopy={(v, l) => void copy(v, l)}
              onChangePipeline={changePipeline}
              onConfigureModel={configure}
              onOpenConnect={() => setModal("connect")}
              onOpenRealtimeModal={() => setModal("realtime")}
              onResetDefaults={resetDefaults}
              onChangeConfig={changeConfig}
              onSetConfig={setConfig}
              onToggleCapability={toggleCapability}
              onChangeTurnDetection={changeTurnDetection}
              onOpenPromptModal={() => setModal("prompt")}
              onOpenVoiceModal={() => setModal("voice")}
              onOpenKeytermsModal={() => setModal("keyterms")}
              onOpenAgentCode={() => {
                setCodeTab("agent");
                setModal("code");
              }}
              onStart={onStart}
              onNotify={notify}
            />
          )}

          {page === "sessions" && (
            <SessionsPage
              allHistory={session.history}
              onSelectSession={setSelectedHistory}
              onOpenClearHistory={() => setModal("clear-history")}
              onOpenPlayground={() => navigate("inference")}
            />
          )}

          {page === "settings" && (
            <SettingsPage
              config={config}
              botSettings={botSettings}
              setBotSettings={setBotSettings}
              cloud={cloud}
              cloudLabel={cloudLabel}
              isLiveReady={isLiveReady}
              activeAgentId={activeAgentId}
              accessToken={accessToken}
              setAccessToken={setAccessToken}
              checking={checking}
              sessionActive={session.active}
              historyCount={session.history.length}
              onSavedCredentials={(nextStatus) => {
                setCloud(nextStatus);
                setSelectedMode("live");
              }}
              onNotify={notify}
              onCopy={(v, l) => void copy(v, l)}
              onCheckConnection={() => void checkConnection(true)}
              onToggleSelfHostedPreset={() => {
                const nextCloud = !config.noise_cancellation;
                setConfig((current) => ({
                  ...current,
                  noise_cancellation: nextCloud,
                  turn_detection: nextCloud ? "turn_detector" : "vad",
                }));
                notify(
                  nextCloud
                    ? "LiveKit Cloud enhancements (QUAIL VF-S + TurnDetector) enabled."
                    : "Self-hosted mode enabled (ai-coustics disabled, local Silero VAD set).",
                );
              }}
              onResetDefaults={resetDefaults}
              onOpenClearHistory={() => setModal("clear-history")}
            />
          )}

          <footer className="app-footer">
            <span>
              <LiveKitLogo small />
              Wave 2.0<span className="footer-dot">·</span>Connected to{" "}
              {activeAgentId}
            </span>
            <span>
              Built with LiveKit Agents<span className="footer-dot">/</span>
              <span className="footer-python">Python & Node.js</span>
            </span>
          </footer>
        </div>
      </main>

      <StudioDialogs
        modal={modal}
        codeTab={codeTab}
        setCodeTab={setCodeTab}
        config={config}
        setConfig={setConfig}
        botSettings={botSettings}
        setBotSettings={setBotSettings}
        cloud={cloud}
        setCloud={setCloud}
        cloudLabel={cloudLabel}
        isLiveReady={isLiveReady}
        activeAgentId={activeAgentId}
        activeProjectId={activeProjectId}
        accessToken={accessToken}
        setAccessToken={setAccessToken}
        checking={checking}
        session={session}
        selectedHistory={selectedHistory}
        onCopy={(v, l) => void copy(v, l)}
        onNotify={notify}
        onCheckConnection={() => void checkConnection(true)}
        onNavigate={navigate}
        onChangePipeline={changePipeline}
        onSetSelectedMode={setSelectedMode}
        onCloseModal={closeModal}
        onCloseHistory={closeHistory}
      />

      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check />
          </span>
          <span>{toast}</span>
          <button
            className="icon-button"
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X />
          </button>
        </div>
      )}
    </div>
  );
}
