import { useMemo, useState } from "react";
import {
  Bot,
  Check,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
} from "lucide-react";
import { postStudioCredentials } from "../api/studioClient";
import { saveSessionBrowserCreds } from "../browserToken";
import {
  DEFAULT_CLOUD_AGENT_ID,
  DEFAULT_CLOUD_AGENT_URL,
  DEFAULT_CLOUD_PROJECT_ID,
  DEFAULT_CLOUD_URL_HINT,
  parseCloudAgentUrl,
  resolveDispatchAgentName,
} from "../types";
import type { BotSettings, CloudStatus, DispatchMode } from "../types";

export type BotLinkEditorProps = {
  botSettings: BotSettings;
  setBotSettings: (updater: (prev: BotSettings) => BotSettings) => void;
  cloud: CloudStatus;
  accessToken: string;
  onSavedCredentials: (nextStatus: CloudStatus) => void;
  onNotify: (message: string) => void;
};

export function BotLinkEditor({
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
      const result = await postStudioCredentials({
        livekitUrl: livekitUrl.trim(),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        agentUrl: botSettings.botUrl.trim() || DEFAULT_CLOUD_AGENT_URL,
        agentName: activeDispatch,
        accessToken,
      });
      if (result.kind === "saved") {
        setApiKey("");
        setApiSecret("");
        onSavedCredentials(result.status);
        return;
      }
      if (result.kind === "error") {
        onNotify(result.message);
        return;
      }
    } finally {
      setSavingCreds(false);
    }

    saveSessionBrowserCreds({
      livekitUrl: livekitUrl.trim(),
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
    });
    let hostLabel: string | null = null;
    try {
      hostLabel = new URL(livekitUrl.trim()).hostname;
    } catch {
      hostLabel = livekitUrl.trim();
    }
    setApiKey("");
    setApiSecret("");
    onSavedCredentials({
      ...cloud,
      configured: true,
      missing: [],
      invalid_url: false,
      offline: false,
      server_host: hostLabel,
      agent_name: activeDispatch,
    });
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
                  customAgentName: prev.customAgentName,
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
