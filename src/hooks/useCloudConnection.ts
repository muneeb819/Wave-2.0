import { useCallback, useEffect, useState } from "react";
import {
  fetchStudioStatus,
  initialCloudStatus,
  syncStudioBotSettings,
} from "../api/studioClient";
import { readSessionBrowserCreds } from "../browserToken";
import { saveBotSettings } from "../types";
import type { BotSettings, CloudStatus, SessionMode } from "../types";

export function useCloudConnection(params: {
  botSettings: BotSettings;
  setBotSettings: (updater: (prev: BotSettings) => BotSettings) => void;
  accessToken: string;
  activeAgentId: string;
  setSelectedMode: (mode: SessionMode) => void;
  notify: (message: string) => void;
}) {
  const {
    botSettings,
    setBotSettings,
    accessToken,
    activeAgentId,
    setSelectedMode,
    notify,
  } = params;
  const [cloud, setCloud] = useState<CloudStatus>(initialCloudStatus);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    saveBotSettings(botSettings);
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void syncStudioBotSettings(
        botSettings,
        accessToken,
        controller.signal,
      ).catch(() => {});
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
        const result = await fetchStudioStatus();
        if (result.kind === "static_404") {
          const tabCreds = readSessionBrowserCreds();
          setCloud({
            ...initialCloudStatus,
            configured: Boolean(tabCreds),
            missing: tabCreds ? [] : initialCloudStatus.missing,
            offline: false,
          });
          if (tabCreds) setSelectedMode("live");
          return;
        }
        if (result.kind === "offline") {
          setCloud({ ...initialCloudStatus, offline: true });
          if (showNotification) {
            notify(
              "API offline. Start it with python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000",
            );
          }
          return;
        }
        const next = result.status;
        setCloud(next);
        if (next.cloud_agent_url || next.sandbox_id || next.dispatch_mode) {
          setBotSettings((prev) => ({
            ...prev,
            botUrl: next.cloud_agent_url || prev.botUrl,
            dispatchMode: next.dispatch_mode || prev.dispatchMode,
            sandboxId: prev.sandboxId || next.sandbox_id || "",
          }));
        }
        if (next.configured || next.sandbox_id) setSelectedMode("live");
        if (showNotification) {
          notify(
            next.configured
              ? `Connected to ${next.server_host} · Ready to dispatch ${activeAgentId}.`
              : next.invalid_url
                ? "LIVEKIT_URL must be a valid wss:// Cloud URL."
                : `Enter your API Key & Secret (or Sandbox ID) for ${activeAgentId} to go live.`,
          );
        }
      } finally {
        setChecking(false);
      }
    },
    [notify, activeAgentId, setBotSettings, setSelectedMode],
  );

  useEffect(() => {
    void checkConnection();
  }, [checkConnection]);

  return { cloud, setCloud, checking, checkConnection };
}
