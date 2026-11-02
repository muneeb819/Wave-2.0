import {
  ArrowUpRight,
  Check,
  Cloud,
  Copy,
  Globe2,
  Loader2,
  LockKeyhole,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { envExample } from "../code";
import { Pill, SetupSteps, StartupModesPanel } from "../components";
import { BotLinkEditor } from "../sections/BotLinkEditor";
import type { BotSettings, CloudStatus, Config } from "../types";

export function SettingsPage({
  config,
  botSettings,
  setBotSettings,
  cloud,
  cloudLabel,
  isLiveReady,
  activeAgentId,
  accessToken,
  setAccessToken,
  checking,
  sessionActive,
  historyCount,
  onSavedCredentials,
  onNotify,
  onCopy,
  onCheckConnection,
  onToggleSelfHostedPreset,
  onResetDefaults,
  onOpenClearHistory,
}: {
  config: Config;
  botSettings: BotSettings;
  setBotSettings: (updater: (prev: BotSettings) => BotSettings) => void;
  cloud: CloudStatus;
  cloudLabel: string;
  isLiveReady: boolean;
  activeAgentId: string;
  accessToken: string;
  setAccessToken: (value: string) => void;
  checking: boolean;
  sessionActive: boolean;
  historyCount: number;
  onSavedCredentials: (nextStatus: CloudStatus) => void;
  onNotify: (message: string) => void;
  onCopy: (value: string, label?: string) => void;
  onCheckConnection: () => void;
  onToggleSelfHostedPreset: () => void;
  onResetDefaults: () => void;
  onOpenClearHistory: () => void;
}) {
  return (
    <div className="settings-page page-enter">
      <section className="panel connection-settings">
        <div className="panel-heading">
          <h2>
            <span className="heading-icon">
              <Cloud />
            </span>
            LiveKit Cloud Bot & Project Connection
          </h2>
          <Pill tone={isLiveReady ? "green" : "amber"}>{cloudLabel}</Pill>
        </div>
        <div className="settings-card-body">
          <BotLinkEditor
            botSettings={botSettings}
            setBotSettings={setBotSettings}
            cloud={cloud}
            accessToken={accessToken}
            onSavedCredentials={(nextStatus) => {
              onSavedCredentials(nextStatus);
              onNotify(
                `Credentials saved to .env.local · Ready to connect to ${activeAgentId}!`,
              );
            }}
            onNotify={onNotify}
          />
          <div className="credential-list">
            {["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"].map(
              (name) => (
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
              ),
            )}
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
              <code>.env.local</code> (mode <code>0600</code>). They are never
              exposed in API responses or browser storage.
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
              onClick={() => onCopy(envExample, ".env template copied.")}
            >
              <Copy />
              Copy .env template
            </button>
            <button
              className="button primary"
              onClick={onCheckConnection}
              disabled={checking}
            >
              {checking ? <Loader2 className="spin" /> : <RotateCcw />}
              Check connection
            </button>
          </div>
        </div>
      </section>
      <div className="settings-side-column">
        <StartupModesPanel onCopy={(cmd, label) => onCopy(cmd, label)} />
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
                Self-hosting open-source LiveKit Server? Toggle off the Cloud{" "}
                <code>ai-coustics</code> noise cancellation plugin and switch
                turn detection to local Silero VAD.
              </p>
              <button
                className="button secondary small-button"
                disabled={sessionActive}
                onClick={onToggleSelfHostedPreset}
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
                Your linked Cloud bot URL, dispatch target, pipeline, models,
                voice, and instructions are saved locally.
              </p>
              <button
                className="button secondary small-button"
                onClick={onResetDefaults}
                disabled={sessionActive}
              >
                <RotateCcw />
                Reset to defaults
              </button>
            </div>
            <div>
              <h3>Session history</h3>
              <p>
                Transcripts are kept only in this tab’s session storage. Clear
                them at any time.
              </p>
              <button
                className="text-button danger-text"
                disabled={!historyCount}
                onClick={onOpenClearHistory}
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
            Deploy updates with <code>lk agent create</code> using the included{" "}
            <code>Dockerfile</code> and verify conversations with{" "}
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
  );
}
