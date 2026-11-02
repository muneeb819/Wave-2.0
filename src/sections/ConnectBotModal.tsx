import {
  ArrowRight,
  Check,
  Cloud,
  Copy,
  Loader2,
  LockKeyhole,
  RotateCcw,
  Settings2,
} from "lucide-react";
import { envExample } from "../code";
import { Modal, SetupSteps } from "../components";
import { DEFAULT_CLOUD_AGENT_URL } from "../types";
import type { BotSettings, CloudStatus } from "../types";
import { BotLinkEditor } from "./BotLinkEditor";

export function ConnectBotModal({
  botSettings,
  setBotSettings,
  cloud,
  cloudLabel,
  isLiveReady,
  activeAgentId,
  activeProjectId,
  accessToken,
  setAccessToken,
  checking,
  onSavedCredentials,
  onCopy,
  onCheckConnection,
  onOpenSettings,
  onPrimaryAction,
  onNotify,
  onClose,
}: {
  botSettings: BotSettings;
  setBotSettings: (updater: (prev: BotSettings) => BotSettings) => void;
  cloud: CloudStatus;
  cloudLabel: string;
  isLiveReady: boolean;
  activeAgentId: string;
  activeProjectId: string;
  accessToken: string;
  setAccessToken: (value: string) => void;
  checking: boolean;
  onSavedCredentials: (nextStatus: CloudStatus) => void;
  onCopy: (value: string, label?: string) => void;
  onCheckConnection: () => void;
  onOpenSettings: () => void;
  onPrimaryAction: () => void;
  onNotify: (message: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={`Connect your LiveKit bot (${activeAgentId}).`}
      eyebrow={`PROJECT ${activeProjectId.toUpperCase()} · AGENT ${activeAgentId}`}
      size="setup-modal"
      onClose={onClose}
    >
      <p className="modal-description">
        Your interface is linked to{" "}
        <code>{botSettings.botUrl || DEFAULT_CLOUD_AGENT_URL}</code>. Enter
        either a <strong>Sandbox ID</strong> (Option A) or your{" "}
        <strong>Project API Key & Secret</strong> (Option B, saved directly to
        server <code>.env.local</code>) to talk live with{" "}
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
        onSavedCredentials={onSavedCredentials}
        onNotify={onNotify}
      />

      <SetupSteps />
      <div className="connection-modal-tools">
        <button
          className="text-button"
          onClick={() => onCopy(envExample, ".env template copied.")}
        >
          <Copy />
          Copy .env template
        </button>
        <button className="text-button" onClick={onOpenSettings}>
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
            This is your optional Studio token, never your LiveKit API secret.
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
          onClick={onCheckConnection}
        >
          {checking ? <Loader2 className="spin" /> : <RotateCcw />}Check
          connection
        </button>
        <button className="button primary" onClick={onPrimaryAction}>
          {isLiveReady
            ? `Start Live session (${activeAgentId})`
            : "Explore the demo"}
          <ArrowRight />
        </button>
      </div>
    </Modal>
  );
}
