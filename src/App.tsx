import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  AudioLines,
  BookOpen,
  Braces,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Cloud,
  Code2,
  Copy,
  Download,
  FileCode2,
  Globe2,
  History,
  Layers3,
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
  SetupSteps,
} from "./components";
import { Playground } from "./Playground";
import { useAgentSession } from "./useAgentSession";
import {
  catalog,
  copyText,
  downloadJSON,
  downloadText,
  formatTime,
  getModel,
  readConfig,
  saveConfig,
} from "./types";
import type {
  CloudStatus,
  Config,
  HistoryEntry,
  ModelKind,
  SessionMode,
} from "./types";
import { envExample, fullAgent, snippet } from "./code";

const initialCloud: CloudStatus = {
  configured: false,
  missing: ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"],
  protected: false,
  invalid_url: false,
  agent_name: "inference-studio",
  server_host: null,
};
type Page = "inference" | "sessions" | "settings";
type Dialog =
  | "code"
  | "connect"
  | "prompt"
  | "voice"
  | "realtime"
  | "clear-history"
  | "workspace"
  | null;

export default function App() {
  const [page, setPage] = useState<Page>("inference");
  const [config, setConfig] = useState<Config>(readConfig);
  const [selectedMode, setSelectedMode] = useState<SessionMode>("demo");
  const [cloud, setCloud] = useState<CloudStatus>(initialCloud);
  const [checking, setChecking] = useState(false);
  const [modal, setModal] = useState<Dialog>(null);
  const [codeTab, setCodeTab] = useState<"snippet" | "agent" | "env">(
    "snippet",
  );
  const [promptDraft, setPromptDraft] = useState(config.instructions);
  const [voiceDraft, setVoiceDraft] = useState(config.voice);
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
  const session = useAgentSession(config);
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

  const checkConnection = useCallback(
    async (showNotification = false) => {
      setChecking(true);
      try {
        const response = await fetch("/api/status");
        if (!response.ok) throw new Error("API unavailable");
        const next: CloudStatus = await response.json();
        setCloud(next);
        if (showNotification)
          notify(
            next.configured
              ? "Cloud credentials found. Start your Python worker to go live."
              : next.invalid_url
                ? "LIVEKIT_URL must be a valid wss:// Cloud URL."
                : "Credentials not found. Add them to .env.local on the server.",
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
    [notify],
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
        (!cloud.configured || (cloud.protected && !accessToken))
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
      cloud.configured,
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
  function resetDefaults() {
    if (!session.active) {
      setConfig({ ...catalog.defaults });
      notify("Default model stack restored.");
    }
  }
  function configure(kind: ModelKind) {
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
        : envExample;
  const codeFilename =
    codeTab === "snippet"
      ? "session.py"
      : codeTab === "agent"
        ? "agent.py"
        : ".env.example";
  const cloudLabel = cloud.offline
    ? "API offline"
    : cloud.configured
      ? "Cloud configured"
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
            <small>Development</small>
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
        <div className="sidebar-section-label resource-label">RESOURCES</div>
        <nav className="resource-navigation" aria-label="Resources">
          <a
            href="https://docs.livekit.io/agents/models/inference/"
            target="_blank"
            rel="noreferrer"
          >
            <BookOpen />
            <span>Documentation</span>
            <ArrowUpRight />
          </a>
          <a
            href="https://docs.livekit.io/reference/python/livekit/agents/"
            target="_blank"
            rel="noreferrer"
          >
            <FileCode2 />
            <span>API reference</span>
            <ArrowUpRight />
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="sidebar-note-icon">
              <Cloud />
              <span className="note-orbit" />
            </div>
            <h3>One key. Every model.</h3>
            <p>
              Great voice AI starts with
              <br />a connected stack.
            </p>
            <button onClick={() => setModal("connect")}>
              Connect your project
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
              <small>Local workspace</small>
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
            <span className="environment-tag">
              <span />
              Development
            </span>
            <span className="topbar-divider" />
            <a
              className="docs-top-link"
              href="https://docs.livekit.io/agents/models/inference/"
              target="_blank"
              rel="noreferrer"
            >
              Docs
              <ArrowUpRight />
            </a>
          </div>
        </header>
        <div className="main-content">
          <section className="page-header">
            <div>
              <span className="eyebrow">YOUR VOICE AI WORKBENCH</span>
              <h1>
                {title}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {page === "inference"
                  ? "Your favorite models. One powerful voice agent."
                  : page === "sessions"
                    ? "Every conversation, a little more insight."
                    : "One project. One connection. Your entire stack."}
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
              className={`cloud-connection ${cloud.configured ? "configured" : ""}`}
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
              <Pipeline
                config={config}
                state={session.state}
                demo={session.mode === "demo"}
                onConfigure={configure}
                onConnect={() => setModal("connect")}
                onRealtime={() => setModal("realtime")}
              />
              <div className="section-heading">
                <div>
                  <h2>
                    Make it your own
                    <span className="model-count-badge">3 models</span>
                  </h2>
                  <p>
                    A purpose-built model for every step of the conversation.
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
                      No credentials? Start with a demo.
                    </>
                  ) : (
                    <>
                      <span className="teal-dot status-dot" />
                      Cloud credentials + running worker required.
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
                    Project connection
                  </h2>
                  <Pill tone={cloud.configured ? "green" : "amber"}>
                    {cloudLabel}
                  </Pill>
                </div>
                <div className="settings-card-body">
                  <div className="settings-intro">
                    <div className="settings-cloud-icon">
                      <Cloud />
                    </div>
                    <div>
                      <h3>Connect to LiveKit Cloud</h3>
                      <p>
                        The same credentials power your realtime transport and
                        every model in the pipeline.
                      </p>
                    </div>
                  </div>
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
                      API credentials are read on the server from{" "}
                      <code>.env.local</code>. They are never sent to your
                      browser.
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
                <section className="panel preferences-panel">
                  <div className="panel-heading">
                    <h2>
                      <Settings2 />
                      Local preferences
                    </h2>
                  </div>
                  <div className="preferences-body">
                    <div>
                      <h3>Model configuration</h3>
                      <p>
                        Your selected models, voice, and instructions are saved
                        in this browser.
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
                    This is a development starter. Add application
                    authentication and a shared rate limiter before exposing the
                    token API publicly. Enable <code>STUDIO_ACCESS_TOKEN</code>{" "}
                    when sharing a preview.
                  </p>
                  <a
                    href="https://docs.livekit.io/frontends/build/authentication/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Authentication guide
                    <ArrowUpRight />
                  </a>
                </section>
              </div>
            </div>
          )}
          <footer className="app-footer">
            <span>
              <LiveKitLogo small />
              Wave 2.0<span className="footer-dot">·</span>Community
              starter
            </span>
            <span>
              Built with LiveKit Agents<span className="footer-dot">/</span>
              <span className="footer-python">Python</span>
            </span>
          </footer>
        </div>
      </main>

      {modal === "code" && (
        <Modal
          title="Your stack. Ready to build."
          eyebrow="LIVEKIT AGENTS · PYTHON SDK"
          size="code-modal"
          onClose={closeModal}
        >
          <p className="modal-description">
            Your current configuration, translated into code. Copy it, customize
            it, make it yours.
          </p>
          <div className="code-modal-tabs">
            {(
              [
                ["snippet", "Session config"],
                ["agent", "Complete agent"],
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
                : codeTab === "agent"
                  ? 'pip install "livekit-agents[silero]==1.8.8" python-dotenv  →  python agent.py dev'
                  : "This config needs a running AgentSession. See Complete agent for the runnable version."}
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
          title="One connection. Every model."
          eyebrow="CONNECT YOUR PROJECT"
          size="setup-modal"
          onClose={closeModal}
        >
          <p className="modal-description">
            Bring your LiveKit Cloud project. We’ll handle the rest of the
            pipeline.
          </p>
          <div
            className={`connection-state-banner ${cloud.configured ? "success" : ""}`}
          >
            {cloud.configured ? <Check /> : <Cloud />}
            <div>
              <strong>{cloudLabel}</strong>
              <span>
                {cloud.configured
                  ? `${cloud.server_host} · Worker availability is checked when you start a session.`
                  : cloud.offline
                    ? "Start the Python API, then check again."
                    : "Demo mode works now. Add server credentials when you’re ready for real audio."}
              </span>
            </div>
          </div>
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
            Never paste your LiveKit API secret into this browser.
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
                setSelectedMode(cloud.configured ? "live" : "demo");
                navigate("inference");
              }}
            >
              {cloud.configured ? "Back to playground" : "Explore the demo"}
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
              onClick={() => setPromptDraft(catalog.defaults.instructions)}
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
            Use the reference voice, or provide another Fish Audio voice ID.
          </p>
          <div className="voice-preview">
            <div className="voice-art">
              <AudioLines />
            </div>
            <div>
              <h3>
                {voiceDraft === catalog.defaults.voice
                  ? "Reference voice"
                  : "Custom Fish Audio voice"}
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
            Voice IDs are provider-specific. Use a voice available through Fish
            Audio. Actual playback is available in a live session.
          </p>
          <div className="modal-footer">
            <button
              className="text-button"
              onClick={() => setVoiceDraft(catalog.defaults.voice)}
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

      {modal === "realtime" && (
        <Modal
          title="A different path to conversation."
          eyebrow="REALTIME MODELS"
          onClose={closeModal}
        >
          <div className="realtime-explainer">
            <span className="realtime-modal-icon">
              <Radio />
            </span>
            <p>
              Realtime models combine speech understanding, reasoning, and audio
              generation in one speech-to-speech model.
            </p>
            <div className="realtime-flow">
              <span>
                <Mic />
                Audio in
              </span>
              <ArrowRight />
              <strong>
                <Sparkles />
                Realtime model
              </strong>
              <ArrowRight />
              <span>
                <AudioLines />
                Audio out
              </span>
            </div>
            <div className="notice-box">
              <AlertCircle />
              <p>
                This starter implements your requested{" "}
                <strong>STT → LLM → TTS</strong> stack. The realtime branch in
                the diagram shows an alternative architecture; it is not enabled
                in this app.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="button secondary" onClick={closeModal}>
              Keep my pipeline
            </button>
            <a
              className="button primary"
              href="https://docs.livekit.io/agents/models/realtime/"
              target="_blank"
              rel="noreferrer"
            >
              Explore realtime
              <ArrowUpRight />
            </a>
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
            A local workspace for building and testing your voice agent. Models
            and instructions are saved in this browser; Cloud credentials live
            on your server.
          </p>
          <div className="workspace-info-row">
            <span>Environment</span>
            <Pill>Development</Pill>
          </div>
          <div className="workspace-info-row">
            <span>Cloud connection</span>
            <Pill tone={cloud.configured ? "green" : "amber"}>
              {cloudLabel}
            </Pill>
          </div>
          <div className="workspace-info-row">
            <span>Agent dispatch name</span>
            <code>{cloud.agent_name}</code>
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
