import { useMemo, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  ChevronRight,
  Cloud,
  LockKeyhole,
  MessageSquare,
  Play,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState } from "../components";
import { formatTime, getModel } from "../types";
import type { HistoryEntry, SessionMode } from "../types";

export function SessionsPage({
  allHistory,
  onSelectSession,
  onOpenClearHistory,
  onOpenPlayground,
}: {
  allHistory: HistoryEntry[];
  onSelectSession: (entry: HistoryEntry) => void;
  onOpenClearHistory: () => void;
  onOpenPlayground: () => void;
}) {
  const [historySearch, setHistorySearch] = useState("");
  const [historyFilter, setHistoryFilter] = useState<"all" | SessionMode>("all");

  const filtered = useMemo(
    () =>
      allHistory.filter(
        (entry) =>
          (historyFilter === "all" || entry.mode === historyFilter) &&
          `${entry.id} ${entry.messages.map((message) => message.text).join(" ")} ${new Date(entry.startedAt).toLocaleString()}`
            .toLowerCase()
            .includes(historySearch.toLowerCase()),
      ),
    [allHistory, historyFilter, historySearch],
  );

  return (
    <div className="sessions-page page-enter">
      <div className="history-notice">
        <ShieldCheck />
        <div>
          <strong>Your conversations stay in this browser tab.</strong>
          <span>
            History is not sent to this app’s server. Closing the tab clears it.
            Download anything you want to keep.
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
            disabled={!allHistory.length}
            onClick={onOpenClearHistory}
            title="Clear all history"
            aria-label="Clear all history"
          >
            <Trash2 />
          </button>
        </div>
        {filtered.length ? (
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
                {filtered.map((entry) => (
                  <tr key={entry.id} onClick={() => onSelectSession(entry)}>
                    <td>
                      <button
                        className="history-session-name"
                        onClick={() => onSelectSession(entry)}
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
                          ? getModel("realtime", entry.config.realtime_model).name
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
                    <td className="mono">{formatTime(entry.duration)}</td>
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
              allHistory.length
                ? "No sessions found."
                : "Your next conversation belongs here."
            }
          >
            {allHistory.length ? (
              "Try a different search or mode filter."
            ) : (
              <>
                Start a demo or live session, then end it to see the transcript
                and metrics.
                <button className="button secondary" onClick={onOpenPlayground}>
                  <ArrowRight />
                  Open playground
                </button>
              </>
            )}
          </EmptyState>
        )}
        <div className="history-panel-footer">
          <span>
            {filtered.length} {filtered.length === 1 ? "session" : "sessions"}
            <span className="muted"> · Latest 20 kept in this tab</span>
          </span>
          <span>
            <LockKeyhole />
            Audio is not recorded by this app
          </span>
        </div>
      </section>
    </div>
  );
}
