import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Bot,
  Braces,
  ChevronsUpDown,
  Cloud,
  FileCode2,
  History,
  Layers3,
  MoreHorizontal,
  Settings2,
} from "lucide-react";
import { LiveKitLogo } from "../components";
import { DEFAULT_CLOUD_AGENT_URL } from "../types";

export type StudioPage = "inference" | "sessions" | "settings";

export function Sidebar({
  page,
  mobileOpen,
  activeAgentId,
  activeProjectId,
  botUrl,
  isLiveReady,
  historyCount,
  onNavigate,
  onCloseMobile,
  onOpenConnect,
  onOpenWorkspace,
}: {
  page: StudioPage;
  mobileOpen: boolean;
  activeAgentId: string;
  activeProjectId: string;
  botUrl: string;
  isLiveReady: boolean;
  historyCount: number;
  onNavigate: (next: StudioPage) => void;
  onCloseMobile: () => void;
  onOpenConnect: () => void;
  onOpenWorkspace: () => void;
}) {
  return (
    <>
      {mobileOpen && <div className="sidebar-scrim" onClick={onCloseMobile} />}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <button
          className="brand-button"
          onClick={() => onNavigate("inference")}
          aria-label="Wave 2.0 home"
        >
          <LiveKitLogo />
          <span className="studio-label">STUDIO</span>
        </button>
        <button className="workspace-switcher" onClick={onOpenWorkspace}>
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
            onClick={() => onNavigate("inference")}
          >
            <Braces />
            <span>Inference</span>
            <span className="nav-lab-tag">LAB</span>
          </button>
          <button
            className={page === "sessions" ? "active" : ""}
            onClick={() => onNavigate("sessions")}
          >
            <History />
            <span>Sessions</span>
            {historyCount > 0 && <span className="nav-count">{historyCount}</span>}
          </button>
          <button
            className={page === "settings" ? "active" : ""}
            onClick={() => onNavigate("settings")}
          >
            <Settings2 />
            <span>Configuration</span>
          </button>
        </nav>
        <div className="sidebar-section-label resource-label">CLOUD BOT</div>
        <nav className="resource-navigation" aria-label="Resources">
          <a
            href={botUrl || DEFAULT_CLOUD_AGENT_URL}
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
            <button onClick={onOpenConnect}>
              {isLiveReady ? "Bot settings" : "Connect your bot"}
              <ArrowRight />
            </button>
          </div>
          <button
            className="developer-profile"
            onClick={() => onNavigate("settings")}
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
    </>
  );
}
