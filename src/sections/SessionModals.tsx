import { useState } from "react";
import { Cloud, Download, Play, Settings2, Trash2 } from "lucide-react";
import { ChatAvatar, CopyButton, EmptyState, Modal, Pill } from "../components";
import { formatTranscriptMarkdown } from "../session/demoSimulator";
import { downloadJSON, formatTime } from "../types";
import type { HistoryEntry } from "../types";

export function ClearHistoryModal({
  historyCount,
  onClear,
  onClose,
}: {
  historyCount: number;
  onClear: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Clear session history?"
      eyebrow="LOCAL DATA"
      size="small-modal"
      onClose={onClose}
    >
      <p className="modal-description">
        This removes all {historyCount} saved sessions and transcripts from this
        browser tab. Download anything you want to keep first. Your model
        configuration won’t change.
      </p>
      <div className="modal-footer">
        <button className="button secondary" onClick={onClose}>
          Keep history
        </button>
        <button className="button danger" onClick={onClear}>
          <Trash2 />
          Clear history
        </button>
      </div>
    </Modal>
  );
}

export function WorkspaceModal({
  activeAgentId,
  activeProjectId,
  isLiveReady,
  cloudLabel,
  onOpenSettings,
  onClose,
}: {
  activeAgentId: string;
  activeProjectId: string;
  isLiveReady: boolean;
  cloudLabel: string;
  onOpenSettings: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title="Your development workspace."
      eyebrow="PERSONAL WORKSPACE"
      size="small-modal"
      onClose={onClose}
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
        <button className="button secondary" onClick={onClose}>
          Close
        </button>
        <button className="button primary" onClick={onOpenSettings}>
          <Settings2 />
          Configuration
        </button>
      </div>
    </Modal>
  );
}

export function TranscriptModal({
  entry,
  onDelete,
  onClose,
}: {
  entry: HistoryEntry;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Modal
      title={`Voice session · ${entry.id.slice(0, 8)}`}
      eyebrow="SESSION TRANSCRIPT"
      size="transcript-modal"
      onClose={onClose}
    >
      <div className="transcript-summary">
        <span className={`mode-badge ${entry.mode}`}>
          {entry.mode === "demo" ? <Play /> : <Cloud />}
          {entry.mode === "demo" ? "Demo · Scripted replies" : "Live session"}
        </span>
        <span>{new Date(entry.startedAt).toLocaleString()}</span>
        <span className="mono">{formatTime(entry.duration)}</span>
      </div>
      <div className="saved-transcript">
        {entry.messages.length ? (
          entry.messages.map((message) => (
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
        <button className="text-button danger-text" onClick={onDelete}>
          <Trash2 />
          Delete session
        </button>
        <CopyButton
          label={copied ? "Copied Markdown" : "Copy Markdown"}
          copied={copied}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(formatTranscriptMarkdown(entry))
              .then(() => setCopied(true));
          }}
        />
        <button
          className="button primary"
          onClick={() =>
            downloadJSON(`inference-${entry.id.slice(0, 8)}.json`, entry)
          }
        >
          <Download />
          Export session
        </button>
      </div>
    </Modal>
  );
}
