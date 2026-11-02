import {
  ArrowUpRight,
  AudioLines,
  ChevronRight,
  Cloud,
  Code2,
  Download,
  Loader2,
  Mic,
  Plus,
  RotateCcw,
  Square,
} from "lucide-react";
import { downloadJSON } from "../types";
import type { HistoryEntry } from "../types";
import type { StudioPage } from "./Sidebar";

export function PageHeader({
  page,
  title,
  activeAgentId,
  activeProjectId,
  sessionActive,
  history,
  checking,
  isLiveReady,
  cloudLabel,
  onNavigate,
  onOpenCode,
  onStart,
  onCheckConnection,
  onOpenConnect,
}: {
  page: StudioPage;
  title: string;
  activeAgentId: string;
  activeProjectId: string;
  sessionActive: boolean;
  history: HistoryEntry[];
  checking: boolean;
  isLiveReady: boolean;
  cloudLabel: string;
  onNavigate: (next: StudioPage) => void;
  onOpenCode: () => void;
  onStart: () => void;
  onCheckConnection: () => void;
  onOpenConnect: () => void;
}) {
  return (
    <>
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
              <button className="button secondary" onClick={onOpenCode}>
                <Code2 />
                Get code
              </button>
              <button
                className={`button primary ${sessionActive ? "stop-primary" : ""}`}
                onClick={onStart}
                title="Ctrl / ⌘ + Enter"
              >
                {sessionActive ? <Square /> : <Mic />}
                {sessionActive ? "End session" : "Start session"}
                {!sessionActive && <ArrowUpRight />}
              </button>
            </>
          ) : page === "sessions" ? (
            <>
              <button
                className="button secondary"
                disabled={!history.length}
                onClick={() => downloadJSON("inference-sessions.json", history)}
              >
                <Download />
                Export all
              </button>
              <button
                className="button primary"
                onClick={() => {
                  onNavigate("inference");
                  if (!sessionActive) onStart();
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
              onClick={onCheckConnection}
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
            onClick={() => onNavigate("inference")}
          >
            <AudioLines />
            Playground
          </button>
          <button
            className={page === "sessions" ? "selected" : ""}
            onClick={() => onNavigate("sessions")}
          >
            Sessions
            {history.length > 0 && (
              <span className="tab-count">{history.length}</span>
            )}
          </button>
          <button
            className={page === "settings" ? "selected" : ""}
            onClick={() => onNavigate("settings")}
          >
            Configuration
          </button>
        </nav>
        <button
          className={`cloud-connection ${isLiveReady ? "configured" : ""}`}
          onClick={onOpenConnect}
        >
          <Cloud />
          <span className="cloud-connection-label">{cloudLabel}</span>
          <span className="connection-dot" />
          <ChevronRight />
        </button>
      </div>
    </>
  );
}
