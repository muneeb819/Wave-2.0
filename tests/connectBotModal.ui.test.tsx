import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initialCloudStatus } from "../src/api/studioClient";
import { ConnectBotModal } from "../src/sections/ConnectBotModal";
import { defaultBotSettings } from "../src/types";

afterEach(cleanup);

describe("ConnectBotModal", () => {
  it("renders sandbox status, protected token field, and action buttons", () => {
    const onCopy = vi.fn();
    const onOpenSettings = vi.fn();
    const onPrimaryAction = vi.fn();
    const setAccessToken = vi.fn();

    render(
      <ConnectBotModal
        botSettings={{ ...defaultBotSettings, sandboxId: "sbx-live-1" }}
        setBotSettings={vi.fn()}
        cloud={{ ...initialCloudStatus, protected: true, configured: true }}
        cloudLabel="Sandbox ready"
        isLiveReady={true}
        activeAgentId="CA_bot"
        activeProjectId="p_proj"
        accessToken=""
        setAccessToken={setAccessToken}
        checking={false}
        onSavedCredentials={vi.fn()}
        onCopy={onCopy}
        onCheckConnection={vi.fn()}
        onOpenSettings={onOpenSettings}
        onPrimaryAction={onPrimaryAction}
        onNotify={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText(/Sandbox "sbx-live-1" ready/i)).toBeInTheDocument();
    fireEvent.change(
      screen.getByPlaceholderText(/Value of STUDIO_ACCESS_TOKEN/i),
      { target: { value: "tok-99" } },
    );
    expect(setAccessToken).toHaveBeenCalledWith("tok-99");

    fireEvent.click(screen.getByRole("button", { name: /Open configuration/i }));
    expect(onOpenSettings).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: /Start Live session/i }));
    expect(onPrimaryAction).toHaveBeenCalledOnce();
  });
});
