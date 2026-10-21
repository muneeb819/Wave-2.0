import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Bot,
  Braces,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Cloud,
  Code2,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  Globe2,
  History,
  KeyRound,
  Layers3,
  Link2,
  Loader2,
  LockKeyhole,
  Menu,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Tag,
  Terminal,
  Trash2,
  X,
} from "lucide-react";
import {
  ChatAvatar,
  CodeBlock,
  EmptyState,
  FeatureRow,
  LiveKitLogo,
  Modal,
  ModelCard,
  Pill,
  Pipeline,
  PipelineCapabilitiesBar,
  RealtimeModelGrid,
  SetupSteps,
  StartupModesPanel,
} from "./components";
import { Playground } from "./Playground";
import { useAgentSession } from "./useAgentSession";
import {
  catalog,
  copyText,
  DEFAULT_CLOUD_AGENT_ID,
  DEFAULT_CLOUD_AGENT_URL,
  DEFAULT_CLOUD_PROJECT_ID,
  DEFAULT_CLOUD_URL_HINT,
  defaultBotSettings,
  defaultConfig,
  downloadJSON,
  downloadText,
  formatTime,
  getModel,
  parseCloudAgentUrl,
  readBotSettings,
  readConfig,
  resolveDispatchAgentName,
  saveBotSettings,
  saveConfig,
} from "./types";
import type {
  BotSettings,
  CloudStatus,
  Config,
  DispatchMode,
  HistoryEntry,
  ModelKind,
  PipelineType,
  SessionMode,
  TurnDetectionMode,
} from "./types";
import {
  envExample,
  fullAgent,
  nodeAgent,
  quickstartAgent,
  snippet,
} from "./code";

const initialCloud: CloudStatus = {
  configured: false,
  missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
  protected: false,
  invalid_url: false,
  agent_name: DEFAULT_CLOUD_AGENT_ID,
  cloud_agent_url: DEFAULT_CLOUD_AGENT_URL,
  cloud_project_id: DEFAULT_CLOUD_PROJECT_ID,
  cloud_agent_id: DEFAULT_CLOUD_AGENT_ID,
  server_url_hint: DEFAULT_CLOUD_URL_HINT,
  server_host: null,
};

type Page = "inference" | "sessions" | "settings";
type CodeTab = "snippet" | "agent" | "quickstart" | "node" | "env";
type Dialog =
  | "code"
  | "connect"
  | "prompt"
  | "voice"
  | "keyterms"
  | "realtime"
  | "clear-history"
  | "workspace"
  | null;

type BotLinkEditorProps = {
  botSettings: BotSettings;
  setBotSettings: (updater: (prev: BotSettings) => BotSettings) => void;
  cloud: CloudStatus;
  accessToken: string;
  onSavedCredentials: (nextStatus: CloudStatus) => void;
  onNotify: (message: string) => void;
};

function BotLinkEditor({
  botSettings,
  setBotSettings,
  cloud,
  accessToken,
  onSavedCredentials,
  onNotify,
}: BotLinkEditorProps) {
  const [livekitUrl, setLivekitUrl] = useState(
    cloud.server_host
      ? `wss://${cloud.server_host}`
      : cloud.server_url_hint || DEFAULT_CLOUD_URL_HINT,
  );
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [savingCreds, setSavingCreds] = useState(false);

  const parsedBot = useMemo(
    () => parseCloudAgentUrl(botSettings.botUrl),
    [botSettings.botUrl],
  );
  const effectiveProjectId =
    parsedBot.projectId || cloud.cloud_project_id || DEFAULT_CLOUD_PROJECT_ID;
  const effectiveAgentId =
    parsedBot.agentId || cloud.cloud_agent_id || DEFAULT_CLOUD_AGENT_ID;
  const activeDispatch = resolveDispatchAgentName(botSettings);

  async function submitServerCredentials(event: React.FormEvent) {
    event.preventDefault();
    if (!livekitUrl.trim() || !apiKey.trim() || !apiSecret.trim()) {
      onNotify("Enter LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.");
      return;
    }
    setSavingCreds(true);
    try {
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          livekit_url: livekitUrl.trim(),
          api_key: apiKey.trim(),
          api_secret: apiSecret.trim(),
          agent_url: botSettings.botUrl.trim() || DEFAULT_CLOUD_AGENT_URL,
          agent_name: activeDispatch,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const msg =
          typeof payload.detail === "string"
            ? payload.detail
            : payload.detail?.message || "Could not save credentials.";
        onNotify(msg);
        return;
      }
      setApiKey("");
      setApiSecret("");
      onSavedCredentials(payload as CloudStatus);
    } catch {
      onNotify(
        "Backend API unreachable. Start it with `python start.py` first.",
      );
    } finally {
      setSavingCreds(false);
    }
  }

  return (
    <div className="bot-config-box">
      <div className="bot-config-header">
        <div className="bot-config-title">
          <Bot />
          <div>
            <strong>Linked LiveKit Cloud Bot</strong>
            <small>
              Project <code>{effectiveProjectId}</code> · Agent{" "}
              <code>{effectiveAgentId}</code>
            </small>
          </div>
        </div>
        <div className="bot-config-links">
          <a
            href={botSettings.botUrl || DEFAULT_CLOUD_AGENT_URL}
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            Open bot in Cloud
            <ExternalLink />
          </a>
          <a
            href={`https://cloud.livekit.io/projects/${effectiveProjectId}/settings/keys`}
            target="_blank"
            rel="noreferrer"
            className="text-button"
          >
            API keys
            <KeyRound />
          </a>
        </div>
      </div>

      <label className="bot-field-label">
        <span>
          <Link2 /> LiveKit Cloud Bot URL
        </span>
        <input
          className="voice-id-input"
          aria-label="LiveKit Cloud Bot URL"
          value={botSettings.botUrl}
          onChange={(event) => {
            const nextUrl = event.target.value;
            setBotSettings((prev) => ({ ...prev, botUrl: nextUrl }));
          }}
          placeholder={DEFAULT_CLOUD_AGENT_URL}
          spellCheck={false}
        />
      </label>

      <div className="bot-two-col">
        <label className="bot-field-label">
          <span>Dispatch target</span>
          <select
            className="bot-dispatch-select"
            aria-label="Bot dispatch mode"
            value={botSettings.dispatchMode}
            onChange={(event) =>
              setBotSettings((prev) => ({
                ...prev,
                dispatchMode: event.target.value as DispatchMode,
              }))
            }
          >
            <option value="cloud-bot">
              Cloud Bot ({effectiveAgentId} + auto fallback)
            </option>
            <option value="auto">
              Automatic dispatch (any active Cloud agent)
            </option>
            <option value="studio-worker">
              Local Studio worker (inference-studio)
            </option>
            <option value="custom">Custom agent name</option>
          </select>
        </label>

        {botSettings.dispatchMode === "custom" ? (
          <label className="bot-field-label">
            <span>Custom agent name</span>
            <input
              className="voice-id-input"
              aria-label="Custom agent dispatch name"
              value={botSettings.customAgentName}
              onChange={(event) =>
                setBotSettings((prev) => ({
                  ...prev,
                  customAgentName: event.target.value,
                }))
              }
              placeholder="my-agent"
              spellCheck={false}
            />
          </label>
        ) : (
          <label className="bot-field-label">
            <span>
              Quick Option A · Sandbox ID{" "}
              <em className="field-subtle">(no API secret required)</em>
            </span>
            <input
              className="voice-id-input"
              aria-label="LiveKit Sandbox ID"
              value={botSettings.sandboxId}
              onChange={(event) =>
                setBotSettings((prev) => ({
                  ...prev,
                  sandboxId: event.target.value,
                }))
              }
              placeholder="Optional: paste Sandbox ID from Cloud Deploy tab"
              spellCheck={false}
            />
          </label>
        )}
      </div>

      <form className="bot-server-creds-form" onSubmit={submitServerCredentials}>
        <div className="bot-creds-caption">
          <KeyRound />
          <span>
            Option B · Server-side Project Keys (saved directly to{" "}
            <code>.env.local</code> with <code>0600</code> permissions — never
            stored in browser storage)
          </span>
        </div>
        <div className="bot-three-col">
          <input
            className="voice-id-input"
            aria-label="LiveKit WebSocket URL"
            value={livekitUrl}
            onChange={(event) => setLivekitUrl(event.target.value)}
            placeholder="wss://your-project.livekit.cloud"
            spellCheck={false}
          />
          <input
            className="voice-id-input"
            aria-label="LiveKit API Key"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="LIVEKIT_API_KEY (API...)"
            autoComplete="off"
            spellCheck={false}
          />
          <input
            className="voice-id-input"
            type="password"
            aria-label="LiveKit API Secret"
            value={apiSecret}
            onChange={(event) => setApiSecret(event.target.value)}
            placeholder="LIVEKIT_API_SECRET"
            autoComplete="new-password"
          />
        </div>
        <div className="bot-save-row">
          <span className="bot-dispatch-preview">
            Active dispatch:{" "}
            <code>{activeDispatch || "automatic (project default)"}</code>
          </span>
          <button
            type="submit"
            className="button primary small-button"
            disabled={savingCreds}
          >
            {savingCreds ? <Loader2 className="spin" /> : <Check />}
            Save to .env.local & connect {effectiveAgentId}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function App() {
  const [page, setPage] = useState<Page>("inference");
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
  const standaloneUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/?mode=live`
      : "/?mode=live";
  const [cloud, setCloud] = useState<CloudStatus>(initialCloud);
  const [checking, setChecking] = useState(false);
  const [modal, setModal] = useState<Dialog>(null);
  const [codeTab, setCodeTab] = useState<CodeTab>("snippet");
  const [promptDraft, setPromptDraft] = useState(config.instructions);
  const [voiceDraft, setVoiceDraft] = useState(config.voice);
  const [keytermsDraft, setKeytermsDraft] = useState(
    config.keyterms.join(", "),
  );
  const [accessToken, setAccessToken] = useState("");
  const [toast, setToast] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | SessionMode>(
    "all",
  );
  const [selectedHistory, setSelectedHistory] = useState<HistoryEntry | null>(
    null,
  );

  const session = useAgentSession(config, botSettings);
  const parsedBot = useMemo(
    () => parseCloudAgentUrl(botSettings.botUrl),
    [botSettings.botUrl],
  );
  const activeAgentId =
    parsedBot.agentId || cloud.cloud_agent_id || DEFAULT_CLOUD_AGENT_ID;
  const activeProjectId =
    parsedBot.projectId || cloud.cloud_project_id || DEFAULT_CLOUD_PROJECT_ID;
  const isLiveReady = cloud.configured || Boolean(botSettings.sandboxId.trim());

  const closeModal = useCallback(() => setModal(null), []);
  const closeHistory = useCallback(() => setSelectedHistory(null), []);
  const notify = useCallback((message: string) => setToast(message), []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3600);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  useEffect(() => {
    saveBotSettings(botSettings);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch("/api/bot-settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          agent_url: botSettings.botUrl,
          dispatch_mode: botSettings.dispatchMode,
          custom_agent_name: botSettings.customAgentName,
          sandbox_id: botSettings.sandboxId,
        }),
        signal: controller.signal,
      }).catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [botSettings, accessToken]);

  const checkConnection = useCallback(
    async (showNotification = false) => {
      setChecking(true);
      try {
        const response = await fetch("/api/status");
        if (!response.ok) throw new Error("API unavailable");
        const next: CloudStatus = await response.json();
        setCloud(next);
        if (next.cloud_agent_url || next.sandbox_id || next.dispatch_mode) {
          setBotSettings((prev) => ({
            ...prev,
            botUrl: next.cloud_agent_url || prev.botUrl,
            dispatchMode: next.dispatch_mode || prev.dispatchMode,
            sandboxId: prev.sandboxId || next.sandbox_id || "",
          }));
        }
        if (next.configured || next.sandbox_id) {
          setSelectedMode("live");
        }
        if (showNotification)
          notify(
            next.configured
              ? `Connected to ${next.server_host} · Ready to dispatch ${activeAgentId}.`
              : next.invalid_url
                ? "LIVEKIT_URL must be a valid wss:// Cloud URL."
                : `Enter your API Key & Secret (or Sandbox ID) for ${activeAgentId} to go live.`,
          );
      } catch {
        setCloud({ ...initialCloud, offline: true });
        if (showNotification)
          notify(
            "API offline. Start it with python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000",
          );
      } finally {
        setChecking(false);
      }
    },
    [notify, activeAgentId],
  );

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

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

  function navigate(next: Page) {
    setPage(next);
    setMobileNav(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function changePipeline(pipeline: PipelineType) {
    if (session.active) return;
    setConfig((current) => ({ ...current, pipeline }));
  }

  function changeConfig(kind: ModelKind | "language", value: string) {
    if (session.active) return;
    setConfig((current) => {
      const next = { ...current, [kind]: value };
      if (
        kind === "stt" &&
        !getModel("stt", value).languages?.includes(next.language)
      )
        next.language = "en";
      return next;
    });
  }

  function toggleCapability(
    field: "noise_cancellation" | "expressive" | "preemptive_generation",
  ) {
    if (session.active) return;
    setConfig((current) => ({ ...current, [field]: !current[field] }));
  }

  function changeTurnDetection(turn_detection: TurnDetectionMode) {
    if (session.active) return;
    setConfig((current) => ({ ...current, turn_detection }));
  }

  function resetDefaults() {
    if (!session.active) {
      setConfig({
        ...defaultConfig,
        keyterms: [...defaultConfig.keyterms],
      });
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

  const history = useMemo(
    () =>
      session.history.filter(
        (entry) =>
          (historyFilter === "all" || entry.mode === historyFilter) &&
          `${entry.id} ${entry.messages.map((message) => message.text).join(" ")} ${new Date(entry.startedAt).toLocaleString()}`
            .toLowerCase()
            .includes(historySearch.toLowerCase()),
      ),
    [session.history, historyFilter, historySearch],
  );

  const code =
    codeTab === "snippet"
      ? snippet(config)
      : codeTab === "agent"
        ? fullAgent(config)
        : codeTab === "quickstart"
          ? quickstartAgent(config)
          : codeTab === "node"
            ? nodeAgent(config)
            : envExample;

  const codeFilename =
    codeTab === "snippet"
      ? "session.py"
      : codeTab === "agent"
        ? "agent.py"
        : codeTab === "quickstart"
          ? "quickstart_agent.py"
          : codeTab === "node"
            ? "main.ts"
            : ".env.example";

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
      {mobileNav && (
        <div className="sidebar-scrim" onClick={() => setMobileNav(false)} />
      )}
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <button
          className="brand-button"
          onClick={() => navigate("inference")}
          aria-label="Wave 2.0 home"
        >
          <LiveKitLogo />
          <span className="studio-label">STUDIO</span>
        </button>
        <button
          className="workspace-switcher"
          onClick={() => setModal("workspace")}
        >
          <span className="workspace-avatar">
            <Layers3 />
          </span>
          <span>
            <strong>Personal workspace</strong>
            <small>
              Bot: {activeAgentId} ({activeProjectId})
            </small>
          </span>
          <ChevronsUpDown />
        </button>
        <div className="sidebar-section-label">BUILD</div>
        <nav className="main-navigation" aria-label="Main navigation">
          <button
            className={page === "inference" ? "active" : ""}
            onClick={() => navigate("inference")}
          >
            <Braces />
            <span>Inference</span>
            <span className="nav-lab-tag">LAB</span>
          </button>
          <button
            className={page === "sessions" ? "active" : ""}
            onClick={() => navigate("sessions")}
          >
            <History />
            <span>Sessions</span>
            {session.history.length > 0 && (
              <span className="nav-count">{session.history.length}</span>
            )}
          </button>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => navigate("settings")}
          >
            <Settings2 />
            <span>Configuration</span>
          </button>
        </nav>
        <div className="sidebar-section-label resource-label">CLOUD BOT</div>
        <nav className="resource-navigation" aria-label="Resources">
          <a
            href={botSettings.botUrl || DEFAULT_CLOUD_AGENT_URL}
            target="_blank"
            rel="noreferrer"
          >
            <Bot />
            <span>{activeAgentId}</span>
            <ArrowUpRight />
          </a>
          <a
            href="https://docs.livekit.io/agents/start/voice-ai/"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen />
            <span>Voice AI quickstart</span>
            <ArrowUpRight />
          </a>
          <a
            href="https://docs.livekit.io/agents/models/inference/"
            target="_blank"
            rel="noreferrer"
          >
            <FileCode2 />
            <span>LiveKit Inference</span>
            <ArrowUpRight />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="sidebar-note-icon">
              <Cloud />
              <span className="note-orbit" />
            </div>
            <h3>Bot {activeAgentId}</h3>
            <p>
              Linked to project <code>{activeProjectId}</code>
              <br />
              for direct Live voice & text.
            </p>
            <button onClick={() => setModal("connect")}>
              {isLiveReady ? "Bot settings" : "Connect your bot"}
              <ArrowRight />
            </button>
          </div>
          <button
            className="developer-profile"
            onClick={() => navigate("settings")}
          >
            <span className="profile-avatar">D</span>
            <span>
              <strong>Developer</strong>
              <small>{activeProjectId}</small>
            </span>
            <MoreHorizontal />
          </button>
        </div>
      </aside>

      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu />
            </button>
            <span className="breadcrumb-icon">
              <Layers3 />
            </span>
            <span>Workspace</span>
            <ChevronRight />
            <span className="breadcrumb-current">{title}</span>
          </div>
          <div className="topbar-actions">
            <a
              className="open-chrome-tab-top"
              href={standaloneUrl}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Wave 2.0 in a full Chrome tab so Chrome can access your microphone"
            >
              <ExternalLink />
              <span>Open in Chrome Tab</span>
            </a>
            <button
              className="environment-tag bot-pill-button"
              onClick={() => setModal("connect")}
              title={`Configure LiveKit Cloud bot ${activeAgentId}`}
            >
              <span />
              Bot · {activeAgentId}
            </button>
            <span className="topbar-divider" />
            <a
              className="docs-top-link"
              href={botSettings.botUrl || DEFAULT_CLOUD_AGENT_URL}
              target="_blank"
              rel="noreferrer"
            >
              Cloud Agent
              <ArrowUpRight />
            </a>
          </div>
        </header>
        <div className="main-content">
          <section className="page-header">
            <div>
              <span className="eyebrow">YOUR VOICE AI WORKBENCH</span>
              <h1 aria-label={`${title}.`}>
                {title}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {page === "inference"
                  ? `Connected interface for LiveKit Cloud bot ${activeAgentId} (${activeProjectId}), plus full STT–LLM–TTS & Realtime workbench.`
                  : page === "sessions"
                    ? "Every conversation, transcript, and latency measurement in one place."
                    : `Configure your LiveKit Cloud bot (${activeAgentId}), credentials, CLI quickstart, and server modes.`}
              </p>
            </div>
            <div className="page-header-actions">
              {page === "inference" ? (
                <>
                  <button
                    className="button secondary"
                    onClick={() => {
                      setCodeTab("snippet");
                      setModal("code");
                    }}
                  >
                    <Code2 />
                    Get code
                  </button>
                  <button
                    className={`button primary ${session.active ? "stop-primary" : ""}`}
                    onClick={() => onStart()}
                    title="Ctrl / ⌘ + Enter"
                  >
                    {session.active ? <Square /> : <Mic />}
                    {session.active ? "End session" : "Start session"}
                    {!session.active && <ArrowUpRight />}
                  </button>
                </>
              ) : page === "sessions" ? (
                <>
                  <button
                    className="button secondary"
                    disabled={!session.history.length}
                    onClick={() =>
                      downloadJSON("inference-sessions.json", session.history)
                    }
                  >
                    <Download />
                    Export all
                  </button>
                  <button
                    className="button primary"
                    onClick={() => {
                      navigate("inference");
                      if (!session.active) onStart();
                    }}
                  >
                    <Plus />
                    New session
                  </button>
                </>
              ) : (
                <button
                  className="button secondary"
                  disabled={checking}
                  onClick={() => void checkConnection(true)}
                >
                  {checking ? <Loader2 className="spin" /> : <RotateCcw />}Check
                  connection
                </button>
              )}
            </div>
          </section>

          <div className="page-tabs-row">
            <nav className="page-tabs" aria-label="Workspace views">
              <button
                className={page === "inference" ? "selected" : ""}
                onClick={() => navigate("inference")}
              >
                <AudioLines />
                Playground
              </button>
              <button
                className={page === "sessions" ? "selected" : ""}
                onClick={() => navigate("sessions")}
              >
                Sessions
                {session.history.length > 0 && (
                  <span className="tab-count">{session.history.length}</span>
                )}
              </button>
              <button
                className={page === "settings" ? "selected" : ""}
                onClick={() => navigate("settings")}
              >
                Configuration
              </button>
            </nav>
            <button
              className={`cloud-connection ${isLiveReady ? "configured" : ""}`}
              onClick={() => setModal("connect")}
            >
              <Cloud />
              <span className="cloud-connection-label">{cloudLabel}</span>
              <span className="connection-dot" />
              <ChevronRight />
            </button>
          </div>

          {page === "inference" && (
            <div className="inference-page page-enter">
              {isEmbeddedIframe && (
                <div className="new-tab-mic-banner" role="region" aria-label="Chrome microphone access">
                  <div className="new-tab-mic-copy">
                    <Mic />
                    <div>
                      <strong>
                        Embedded preview restricts Chrome microphone permissions.
                      </strong>
                      <span>
                        Open this session in a standalone Chrome browser tab for
                        full two-way voice audio with <code>{activeAgentId}</code>.
                      </span>
                    </div>
                  </div>
                  <div className="new-tab-mic-actions">
                    <button
                      type="button"
                      className="button secondary small-button"
                      onClick={() =>
                        void copy(
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
                onPipelineChange={changePipeline}
                onConfigure={configure}
                onConnect={() => setModal("connect")}
                onRealtime={() => setModal("realtime")}
              />
              <div className="section-heading">
                <div>
                  <h2>
                    Make it your own
                    <span className="model-count-badge">
                      {config.pipeline === "realtime"
                        ? "Speech-to-speech"
                        : "3 models"}
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
                  onClick={resetDefaults}
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
                    setConfig((current) => ({
                      ...current,
                      realtime_model: modelId,
                    }))
                  }
                  onVoiceChange={(voiceId) =>
                    setConfig((current) => ({
                      ...current,
                      realtime_voice: voiceId,
                    }))
                  }
                  onLanguageChange={(language) =>
                    setConfig((current) => ({ ...current, language }))
                  }
                  onNoiseToggle={() => toggleCapability("noise_cancellation")}
                  onPrompt={() => {
                    setPromptDraft(config.instructions);
                    setModal("prompt");
                  }}
                />
              ) : (
                <div className="model-grid">
                  {(["stt", "llm", "tts"] as const).map((kind) => (
                    <ModelCard
                      key={kind}
                      kind={kind}
                      config={config}
                      disabled={session.active}
                      onChange={changeConfig}
                      onPrompt={() => {
                        setPromptDraft(config.instructions);
                        setModal("prompt");
                      }}
                      onVoice={() => {
                        setVoiceDraft(config.voice);
                        setModal("voice");
                      }}
                    />
                  ))}
                </div>
              )}

              <PipelineCapabilitiesBar
                config={config}
                disabled={session.active}
                onTurnDetectionChange={changeTurnDetection}
                onToggle={toggleCapability}
                onKeyterms={() => {
                  setKeytermsDraft(config.keyterms.join(", "));
                  setModal("keyterms");
                }}
              />

              {session.active && (
                <p className="config-locked">
                  <LockKeyhole />
                  Model settings are locked during a session. End it to make
                  changes.
                </p>
              )}
              <div className="playground-section-heading">
                <span className="eyebrow">
                  FROM CONFIGURATION TO CONVERSATION
                </span>
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
                      Live target: <code>{activeAgentId}</code> (
                      {activeProjectId})
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
                onCode={() => {
                  setCodeTab("agent");
                  setModal("code");
                }}
                onToast={notify}
              />
              <FeatureRow />
            </div>
          )}

          {page === "sessions" && (
            <div className="sessions-page page-enter">
              <div className="history-notice">
                <ShieldCheck />
                <div>
                  <strong>Your conversations stay in this browser tab.</strong>
                  <span>
                    History is not sent to this app’s server. Closing the tab
                    clears it. Download anything you want to keep.
                  </span>
                </div>
              </div>
              <section className="panel history-panel">
                <div className="history-toolbar">
                  <label className="search-field">
                    <Search />
                    <input
                      placeholder="Search sessions…"
                      aria-label="Search sessions"
                      value={historySearch}
                      onChange={(event) => setHistorySearch(event.target.value)}
                    />
                    {historySearch && (
                      <button
                        className="icon-button"
                        onClick={() => setHistorySearch("")}
                        aria-label="Clear search"
                      >
                        <X />
                      </button>
                    )}
                  </label>
                  <div className="history-filters">
                    {(["all", "live", "demo"] as const).map((filter) => (
                      <button
                        key={filter}
                        className={historyFilter === filter ? "selected" : ""}
                        onClick={() => setHistoryFilter(filter)}
                      >
                        {filter === "all"
                          ? "All sessions"
                          : filter === "live"
                            ? "Live"
                            : "Demo"}
                      </button>
                    ))}
                  </div>
                  <button
                    className="icon-button"
                    disabled={!session.history.length}
                    onClick={() => setModal("clear-history")}
                    title="Clear all history"
                    aria-label="Clear all history"
                  >
                    <Trash2 />
                  </button>
                </div>
                {history.length ? (
                  <div className="history-table-wrapper">
                    <table className="history-table">
                      <thead>
                        <tr>
                          <th>SESSION</th>
                          <th>MODE</th>
                          <th>PIPELINE</th>
                          <th>STARTED</th>
                          <th>DURATION</th>
                          <th>MESSAGES</th>
                          <th aria-label="Actions" />
                        </tr>
                      </thead>
                      <tbody>
                        {history.map((entry) => (
                          <tr
                            key={entry.id}
                            onClick={() => setSelectedHistory(entry)}
                          >
                            <td>
                              <button
                                className="history-session-name"
                                onClick={() => setSelectedHistory(entry)}
                              >
                                <span className="session-row-icon">
                                  <AudioLines />
                                </span>
                                <span>
                                  <strong>Voice session</strong>
                                  <small>{entry.id.slice(0, 8)}</small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <span className={`mode-badge ${entry.mode}`}>
                                {entry.mode === "demo" ? <Play /> : <Cloud />}
                                {entry.mode === "demo" ? "Demo" : "Live"}
                              </span>
                            </td>
                            <td>
                              <span className="mono">
                                {entry.config.pipeline === "realtime"
                                  ? getModel(
                                      "realtime",
                                      entry.config.realtime_model,
                                    ).name
                                  : "STT → LLM → TTS"}
                              </span>
                            </td>
                            <td>
                              {new Date(entry.startedAt).toLocaleString([], {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="mono">
                              {formatTime(entry.duration)}
                            </td>
                            <td>
                              <span className="history-message-count">
                                <MessageSquare />
                                {entry.messages.length}
                              </span>
                            </td>
                            <td>
                              <ChevronRight />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    icon={historySearch ? "search" : "session"}
                    title={
                      session.history.length
                        ? "No sessions found."
                        : "Your next conversation belongs here."
                    }
                  >
                    {session.history.length ? (
                      "Try a different search or mode filter."
                    ) : (
                      <>
                        Start a demo or live session, then end it to see the
                        transcript and metrics.
                        <button
                          className="button secondary"
                          onClick={() => navigate("inference")}
                        >
                          <ArrowRight />
                          Open playground
                        </button>
                      </>
                    )}
                  </EmptyState>
                )}
                <div className="history-panel-footer">
                  <span>
                    {history.length}{" "}
                    {history.length === 1 ? "session" : "sessions"}
                    <span className="muted"> · Latest 20 kept in this tab</span>
                  </span>
                  <span>
                    <LockKeyhole />
                    Audio is not recorded by this app
                  </span>
                </div>
              </section>
            </div>
          )}

          {page === "settings" && (
            <div className="settings-page page-enter">
              <section className="panel connection-settings">
                <div className="panel-heading">
                  <h2>
                    <span className="heading-icon">
                      <Cloud />
                    </span>
                    LiveKit Cloud Bot & Project Connection
                  </h2>
                  <Pill tone={isLiveReady ? "green" : "amber"}>
                    {cloudLabel}
                  </Pill>
                </div>
                <div className="settings-card-body">
                  <BotLinkEditor
                    botSettings={botSettings}
                    setBotSettings={setBotSettings}
                    cloud={cloud}
                    accessToken={accessToken}
                    onSavedCredentials={(nextStatus) => {
                      setCloud(nextStatus);
                      setSelectedMode("live");
                      notify(
                        `Credentials saved to .env.local · Ready to connect to ${activeAgentId}!`,
                      );
                    }}
                    onNotify={notify}
                  />
                  <div className="credential-list">
                    {[
                      "LIVEKIT_URL",
                      "LIVEKIT_API_KEY",
                      "LIVEKIT_API_SECRET",
                    ].map((name) => (
                      <div className="credential-row" key={name}>
                        <LockKeyhole />
                        <code>{name}</code>
                        <span
                          className={
                            cloud.missing.includes(name)
                              ? "credential-missing"
                              : "credential-set"
                          }
                        >
                          {cloud.missing.includes(name) ? (
                            "Not configured"
                          ) : (
                            <>
                              <Check />
                              Set on server
                            </>
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                  {cloud.server_host && (
                    <p className="connected-host">
                      <Globe2 />
                      {cloud.server_host}
                    </p>
                  )}
                  <div className="settings-security-note">
                    <ShieldCheck />
                    <span>
                      API credentials are stored server-side only in{" "}
                      <code>.env.local</code> (mode <code>0600</code>). They are
                      never exposed in API responses or browser storage.
                    </span>
                  </div>
                  <SetupSteps />
                  {cloud.protected && (
                    <label className="access-token-field">
                      Studio access token
                      <input
                        type="password"
                        value={accessToken}
                        autoComplete="off"
                        onChange={(event) => setAccessToken(event.target.value)}
                        placeholder="Enter the token set in STUDIO_ACCESS_TOKEN"
                      />
                      <small>
                        Not a LiveKit API key. Kept in this page’s memory only.
                      </small>
                    </label>
                  )}
                  <div className="settings-actions">
                    <button
                      className="button secondary"
                      onClick={() =>
                        void copy(envExample, ".env template copied.")
                      }
                    >
                      <Copy />
                      Copy .env template
                    </button>
                    <button
                      className="button primary"
                      onClick={() => void checkConnection(true)}
                      disabled={checking}
                    >
                      {checking ? <Loader2 className="spin" /> : <RotateCcw />}
                      Check connection
                    </button>
                  </div>
                </div>
              </section>
              <div className="settings-side-column">
                <StartupModesPanel
                  onCopy={(cmd, label) => void copy(cmd, label)}
                />
                <section className="panel preferences-panel">
                  <div className="panel-heading">
                    <h2>
                      <Settings2 />
                      Environment & local preferences
                    </h2>
                  </div>
                  <div className="preferences-body">
                    <div>
                      <h3>Self-hosting vs LiveKit Cloud</h3>
                      <p>
                        Self-hosting open-source LiveKit Server? Toggle off the
                        Cloud <code>ai-coustics</code> noise cancellation plugin
                        and switch turn detection to local Silero VAD.
                      </p>
                      <button
                        className="button secondary small-button"
                        disabled={session.active}
                        onClick={() => {
                          const nextCloud = !config.noise_cancellation;
                          setConfig((current) => ({
                            ...current,
                            noise_cancellation: nextCloud,
                            turn_detection: nextCloud
                              ? "turn_detector"
                              : "vad",
                          }));
                          notify(
                            nextCloud
                              ? "LiveKit Cloud enhancements (QUAIL VF-S + TurnDetector) enabled."
                              : "Self-hosted mode enabled (ai-coustics disabled, local Silero VAD set).",
                          );
                        }}
                      >
                        <ShieldCheck />
                        {config.noise_cancellation
                          ? "Switch to self-hosted preset"
                          : "Switch to LiveKit Cloud preset"}
                      </button>
                    </div>
                    <div>
                      <h3>Model & bot configuration</h3>
                      <p>
                        Your linked Cloud bot URL, dispatch target, pipeline,
                        models, voice, and instructions are saved locally.
                      </p>
                      <button
                        className="button secondary small-button"
                        onClick={resetDefaults}
                        disabled={session.active}
                      >
                        <RotateCcw />
                        Reset to defaults
                      </button>
                    </div>
                    <div>
                      <h3>Session history</h3>
                      <p>
                        Transcripts are kept only in this tab’s session storage.
                        Clear them at any time.
                      </p>
                      <button
                        className="text-button danger-text"
                        disabled={!session.history.length}
                        onClick={() => setModal("clear-history")}
                      >
                        <Trash2 />
                        Clear history
                      </button>
                    </div>
                  </div>
                </section>
                <section className="production-note">
                  <ShieldCheck />
                  <h3>Taking it to production?</h3>
                  <p>
                    Deploy updates with <code>lk agent create</code> using the
                    included <code>Dockerfile</code> and verify conversations
                    with{" "}
                    <code>lk agent simulate text --scenarios scenarios.yaml</code>.
                  </p>
                  <a
                    href="https://docs.livekit.io/deploy/agents/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Agent deployment guide
                    <ArrowUpRight />
                  </a>
                </section>
              </div>
            </div>
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

      {modal === "code" && (
        <Modal
          title="Your stack. Ready to build."
          eyebrow="LIVEKIT AGENTS · PYTHON & NODE.JS SDK"
          size="code-modal"
          onClose={closeModal}
        >
          <p className="modal-description">
            Your active{" "}
            <strong>
              {config.pipeline === "realtime"
                ? "Realtime speech-to-speech"
                : "STT → LLM → TTS"}
            </strong>{" "}
            stack translated directly into runnable Python (`uv`) and Node.js
            (`pnpm`) starter code.
          </p>
          <div className="code-modal-tabs">
            {(
              [
                ["snippet", "Session config"],
                ["agent", "Complete agent"],
                ["quickstart", "Quickstart agent.py"],
                ["node", "Node.js starter"],
                ["env", "Environment"],
              ] as const
            ).map(([tab, label]) => (
              <button
                className={codeTab === tab ? "selected" : ""}
                onClick={() => setCodeTab(tab)}
                key={tab}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="modal-code-container">
            <div className="modal-code-filename">
              <FileCode2 />
              <span>{codeFilename}</span>
              <button className="text-button" onClick={() => void copy(code)}>
                <Copy />
                Copy
              </button>
            </div>
            <CodeBlock code={code} lineNumbers />
          </div>
          <div className="code-run-note">
            <Terminal />
            <span>
              {codeTab === "env"
                ? "Save as .env.local on your server. Never commit your API secret."
                : codeTab === "node"
                  ? "cd agent-node && pnpm install && lk agent dev"
                  : codeTab === "quickstart"
                    ? "uv sync && lk agent dev  (or uv run agent.py console)"
                    : codeTab === "agent"
                      ? "uv sync && python -m backend.agent dev"
                      : "See Complete agent, Quickstart agent.py, or Node.js starter for full runnable files."}
            </span>
          </div>
          <div className="modal-footer">
            <span>
              <ShieldCheck />
              Your keys stay server-side.
            </span>
            <button
              className="button primary"
              onClick={() => {
                downloadText(codeFilename, code);
                notify(`${codeFilename} downloaded.`);
              }}
            >
              <Download />
              Download {codeFilename}
            </button>
          </div>
        </Modal>
      )}

      {modal === "connect" && (
        <Modal
          title={`Connect your LiveKit bot (${activeAgentId}).`}
          eyebrow={`PROJECT ${activeProjectId.toUpperCase()} · AGENT ${activeAgentId}`}
          size="setup-modal"
          onClose={closeModal}
        >
          <p className="modal-description">
            Your interface is linked to{" "}
            <code>{botSettings.botUrl || DEFAULT_CLOUD_AGENT_URL}</code>. Enter
            either a <strong>Sandbox ID</strong> (Option A) or your{" "}
            <strong>Project API Key & Secret</strong> (Option B, saved directly
            to server <code>.env.local</code>) to talk live with{" "}
            <code>{activeAgentId}</code>.
          </p>
          <div
            className={`connection-state-banner ${isLiveReady ? "success" : ""}`}
          >
            {isLiveReady ? <Check /> : <Cloud />}
            <div>
              <strong>{cloudLabel}</strong>
              <span>
                {botSettings.sandboxId.trim()
                  ? `Sandbox "${botSettings.sandboxId.trim()}" ready · Dispatches ${activeAgentId} directly in LiveKit Cloud.`
                  : cloud.configured
                    ? `${cloud.server_host} · Dispatches ${activeAgentId} (with automatic fallback if unnamed).`
                    : cloud.offline
                      ? "Start the Python API, then check again."
                      : "Add a Sandbox ID or save your Project API keys below to start a Live voice session."}
              </span>
            </div>
          </div>

          <BotLinkEditor
            botSettings={botSettings}
            setBotSettings={setBotSettings}
            cloud={cloud}
            accessToken={accessToken}
            onSavedCredentials={(nextStatus) => {
              setCloud(nextStatus);
              setSelectedMode("live");
              closeModal();
              notify(
                `Connected to ${nextStatus.server_host} · Starting Live session with ${activeAgentId}!`,
              );
              void session.start("live", accessToken);
            }}
            onNotify={notify}
          />

          <SetupSteps />
          <div className="connection-modal-tools">
            <button
              className="text-button"
              onClick={() => void copy(envExample, ".env template copied.")}
            >
              <Copy />
              Copy .env template
            </button>
            <button
              className="text-button"
              onClick={() => {
                closeModal();
                navigate("settings");
              }}
            >
              <Settings2 />
              Open configuration
              <ArrowRight />
            </button>
          </div>
          {cloud.protected && (
            <label className="access-token-field">
              Studio access token
              <input
                type="password"
                autoComplete="off"
                value={accessToken}
                onChange={(event) => setAccessToken(event.target.value)}
                placeholder="Value of STUDIO_ACCESS_TOKEN"
              />
              <small>
                This is your optional Studio token, never your LiveKit API
                secret.
              </small>
            </label>
          )}
          <div className="connection-security">
            <LockKeyhole />
            Never paste your LiveKit API secret into this browser unless saving
            directly to your local server <code>.env.local</code> above.
          </div>
          <div className="modal-footer">
            <button
              className="button secondary"
              disabled={checking}
              onClick={() => void checkConnection(true)}
            >
              {checking ? <Loader2 className="spin" /> : <RotateCcw />}Check
              connection
            </button>
            <button
              className="button primary"
              onClick={() => {
                closeModal();
                setSelectedMode(isLiveReady ? "live" : "demo");
                navigate("inference");
                if (isLiveReady && !session.active) {
                  void session.start("live", accessToken);
                }
              }}
            >
              {isLiveReady
                ? `Start Live session (${activeAgentId})`
                : "Explore the demo"}
              <ArrowRight />
            </button>
          </div>
        </Modal>
      )}

      {modal === "prompt" && (
        <Modal
          title="Shape your agent’s personality."
          eyebrow="LANGUAGE MODEL · SYSTEM INSTRUCTIONS"
          onClose={closeModal}
        >
          <p className="modal-description">
            Tell your agent how to respond. Clear, conversational instructions
            work best for voice.
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
              disabled={promptDraft.trim().length < 10 || session.active}
              onClick={() => {
                setConfig((current) => ({
                  ...current,
                  instructions: promptDraft.trim(),
                }));
                closeModal();
                notify("System instructions saved.");
              }}
            >
              <Check />
              Save instructions
            </button>
          </div>
        </Modal>
      )}

      {modal === "voice" && (
        <Modal
          title="Find your agent’s voice."
          eyebrow="FISH AUDIO · VOICE SETTINGS"
          onClose={closeModal}
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
              <p>
                {getModel("tts", config.tts).name} · Streaming text to speech
              </p>
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
            selected TTS provider. Actual playback is available in a live
            session.
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
                !/^[A-Za-z0-9_-]{1,128}$/.test(voiceDraft) || session.active
              }
              onClick={() => {
                setConfig((current) => ({ ...current, voice: voiceDraft }));
                closeModal();
                notify("Voice settings saved.");
              }}
            >
              <Check />
              Save voice
            </button>
          </div>
        </Modal>
      )}

      {modal === "keyterms" && (
        <Modal
          title="Boost domain vocabulary."
          eyebrow="STT CONTEXT · KEYTERMS & DETECTION"
          onClose={closeModal}
        >
          <p className="modal-description">
            Bias speech recognition toward product names, brands, and technical
            jargon via <code>STTContextOptions</code>. Live keyterm detection
            also learns caller names automatically during the conversation.
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
              onClick={() =>
                setKeytermsDraft(defaultConfig.keyterms.join(", "))
              }
            >
              <RotateCcw />
              Restore defaults
            </button>
            <button
              className="button primary"
              disabled={session.active}
              onClick={() => {
                const parsed = keytermsDraft
                  .split(",")
                  .map((item) => item.trim())
                  .filter((item) =>
                    /^[A-Za-z0-9][A-Za-z0-9 .,'&/_-]{0,63}$/.test(item),
                  )
                  .slice(0, 20);
                setConfig((current) => ({ ...current, keyterms: parsed }));
                closeModal();
                notify(`Saved ${parsed.length} STT keyterms.`);
              }}
            >
              <Tag />
              Save keyterms
            </button>
          </div>
        </Modal>
      )}

      {modal === "realtime" && (
        <Modal
          title="Speech-to-speech Realtime pipeline."
          eyebrow="REALTIME MODELS · LIVEKIT INFERENCE"
          onClose={closeModal}
        >
          <div className="realtime-explainer">
            <span className="realtime-modal-icon">
              <Radio />
            </span>
            <p>
              Realtime models combine speech understanding, reasoning, and audio
              generation directly in a single speech-to-speech model through
              LiveKit Inference — with no extra API keys required.
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
                disabled={session.active}
                onChange={(event) =>
                  setConfig((current) => ({
                    ...current,
                    realtime_model: event.target.value,
                  }))
                }
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
                  disabled={session.active}
                  onClick={() => {
                    changePipeline("stt-llm-tts");
                    closeModal();
                    notify("Switched to STT → LLM → TTS pipeline.");
                  }}
                >
                  Switch to STT-LLM-TTS
                </button>
                <button className="button primary" onClick={closeModal}>
                  Keep Realtime active
                </button>
              </>
            ) : (
              <>
                <button className="button secondary" onClick={closeModal}>
                  Keep STT-LLM-TTS pipeline
                </button>
                <button
                  className="button primary"
                  disabled={session.active}
                  onClick={() => {
                    changePipeline("realtime");
                    closeModal();
                    notify(
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
      )}

      {modal === "clear-history" && (
        <Modal
          title="Clear session history?"
          eyebrow="LOCAL DATA"
          size="small-modal"
          onClose={closeModal}
        >
          <p className="modal-description">
            This removes all {session.history.length} saved sessions and
            transcripts from this browser tab. Download anything you want to
            keep first. Your model configuration won’t change.
          </p>
          <div className="modal-footer">
            <button className="button secondary" onClick={closeModal}>
              Keep history
            </button>
            <button
              className="button danger"
              onClick={() => {
                session.clearHistory();
                closeModal();
                notify("Session history cleared.");
              }}
            >
              <Trash2 />
              Clear history
            </button>
          </div>
        </Modal>
      )}

      {modal === "workspace" && (
        <Modal
          title="Your development workspace."
          eyebrow="PERSONAL WORKSPACE"
          size="small-modal"
          onClose={closeModal}
        >
          <p className="modal-description">
            Connected interface for your LiveKit Cloud bot{" "}
            <code>{activeAgentId}</code> inside project{" "}
            <code>{activeProjectId}</code>.
          </p>
          <div className="workspace-info-row">
            <span>Linked Cloud Bot</span>
            <Pill tone="green">{activeAgentId}</Pill>
          </div>
          <div className="workspace-info-row">
            <span>LiveKit Project</span>
            <code>{activeProjectId}</code>
          </div>
          <div className="workspace-info-row">
            <span>Cloud connection</span>
            <Pill tone={isLiveReady ? "green" : "amber"}>{cloudLabel}</Pill>
          </div>
          <div className="modal-footer">
            <button className="button secondary" onClick={closeModal}>
              Close
            </button>
            <button
              className="button primary"
              onClick={() => {
                closeModal();
                navigate("settings");
              }}
            >
              <Settings2 />
              Configuration
            </button>
          </div>
        </Modal>
      )}

      {selectedHistory && (
        <Modal
          title={`Voice session · ${selectedHistory.id.slice(0, 8)}`}
          eyebrow="SESSION TRANSCRIPT"
          size="transcript-modal"
          onClose={closeHistory}
        >
          <div className="transcript-summary">
            <span className={`mode-badge ${selectedHistory.mode}`}>
              {selectedHistory.mode === "demo" ? <PlayIcon /> : <Cloud />}
              {selectedHistory.mode === "demo"
                ? "Demo · Scripted replies"
                : "Live session"}
            </span>
            <span>{new Date(selectedHistory.startedAt).toLocaleString()}</span>
            <span className="mono">{formatTime(selectedHistory.duration)}</span>
          </div>
          <div className="saved-transcript">
            {selectedHistory.messages.length ? (
              selectedHistory.messages.map((message) => (
                <div className="chat-message" key={message.id}>
                  <ChatAvatar role={message.role} />
                  <div className="message-content">
                    <div className="message-meta">
                      <strong>
                        {message.role === "assistant" ? "Your agent" : "You"}
                      </strong>
                      <time>
                        {new Date(message.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                    <p>{message.text}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="A quiet session.">
                No messages were exchanged in this session.
              </EmptyState>
            )}
          </div>
          <div className="modal-footer">
            <button
              className="text-button danger-text"
              onClick={() => {
                session.deleteHistory(selectedHistory.id);
                closeHistory();
                notify("Session removed from history.");
              }}
            >
              <Trash2 />
              Delete session
            </button>
            <button
              className="button primary"
              onClick={() =>
                downloadJSON(
                  `inference-${selectedHistory.id.slice(0, 8)}.json`,
                  selectedHistory,
                )
              }
            >
              <Download />
              Export session
            </button>
          </div>
        </Modal>
      )}

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

function PlayIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <path d="m8 5 11 7-11 7V5Z" />
    </svg>
  );
}
