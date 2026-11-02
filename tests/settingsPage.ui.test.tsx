import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialCloudStatus } from "../src/api/studioClient";
import { SettingsPage } from "../src/pages/SettingsPage";
import { defaultBotSettings, defaultConfig } from "../src/types";

afterEach(cleanup);

describe("SettingsPage", () => {
  it("renders protected Studio token input, connected host, and action handlers", () => {
    const setAccessToken = vi.fn();
    const onCopy = vi.fn();
    const onCheckConnection = vi.fn();
    const onToggleSelfHostedPreset = vi.fn();
    const onResetDefaults = vi.fn();
    const onOpenClearHistory = vi.fn();

    render(
      <SettingsPage
        config={defaultConfig}
        botSettings={defaultBotSettings}
        setBotSettings={vi.fn()}
        cloud={{
          ...initialCloudStatus,
          configured: true,
          protected: true,
          missing: [],
          server_host: "wave-prod.livekit.cloud",
        }}
        cloudLabel="Connected"
        isLiveReady={true}
        activeAgentId="CA_bot"
        accessToken=""
        setAccessToken={setAccessToken}
        checking={false}
        sessionActive={false}
        historyCount={2}
        onSavedCredentials={vi.fn()}
        onNotify={vi.fn()}
        onCopy={onCopy}
        onCheckConnection={onCheckConnection}
        onToggleSelfHostedPreset={onToggleSelfHostedPreset}
        onResetDefaults={onResetDefaults}
        onOpenClearHistory={onOpenClearHistory}
      />,
    );

    expect(screen.getByText("wave-prod.livekit.cloud")).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText(/Enter the token set in STUDIO_ACCESS_TOKEN/i),
      { target: { value: "secret-studio-token" } },
    );
    expect(setAccessToken).toHaveBeenCalledWith("secret-studio-token");

    fireEvent.click(screen.getByRole("button", { name: /Copy \.env template/i }));
    expect(onCopy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Check connection/i }));
    expect(onCheckConnection).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Clear history/i }));
    expect(onOpenClearHistory).toHaveBeenCalledOnce();
  });
});
