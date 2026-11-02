import { useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, LockKeyhole, Terminal } from "lucide-react";

const CLI_INSTALL_COMMANDS = {
  macos: "brew install livekit-cli && lk cloud auth",
  linux: "curl -sSL https://get.livekit.io/cli | bash && lk cloud auth",
  windows: "winget install LiveKit.LiveKitCLI && lk cloud auth",
  source: "go install github.com/livekit/livekit-cli/v2/cmd/lk@latest",
} as const;

export function SetupSteps({ children }: { children?: ReactNode }) {
  const [osTab, setOsTab] = useState<keyof typeof CLI_INSTALL_COMMANDS>("macos");
  const [sdkTab, setSdkTab] = useState<"python" | "node">("python");

  return (
    <div className="setup-steps">
      <div className="setup-step">
        <span className="step-number">1</span>
        <div>
          <h3>Install LiveKit CLI & add Cloud credentials</h3>
          <p>
            Link your project with <code>lk cloud auth</code> or copy{" "}
            <code>.env.example</code> to <code>.env.local</code> using keys from{" "}
            <a href="https://cloud.livekit.io/" target="_blank" rel="noreferrer">
              LiveKit Cloud <ArrowUpRight />
            </a>
            .
          </p>
          <div className="mini-tab-row" role="tablist" aria-label="CLI platform">
            {(
              [
                ["macos", "macOS"],
                ["linux", "Linux"],
                ["windows", "Windows"],
                ["source", "From Source"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={osTab === key}
                className={osTab === key ? "active" : ""}
                onClick={() => setOsTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="setup-command">
            <Terminal />
            <code>{CLI_INSTALL_COMMANDS[osTab]}</code>
          </div>
          <div className="setup-command">
            <LockKeyhole />
            <code>LIVEKIT_URL · LIVEKIT_API_KEY · LIVEKIT_API_SECRET</code>
          </div>
        </div>
      </div>

      <div className="setup-step">
        <span className="step-number">2</span>
        <div>
          <h3>Install dependencies & run your agent worker</h3>
          <p>
            Use either the included <strong>Python (`uv`)</strong> worker or{" "}
            <strong>Node.js (`pnpm`)</strong> starter project with the same Cloud
            project.
          </p>
          <div
            className="mini-tab-row"
            role="tablist"
            aria-label="Starter language"
          >
            <button
              type="button"
              role="tab"
              aria-selected={sdkTab === "python"}
              className={sdkTab === "python" ? "active" : ""}
              onClick={() => setSdkTab("python")}
            >
              Python (uv)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sdkTab === "node"}
              className={sdkTab === "node" ? "active" : ""}
              onClick={() => setSdkTab("node")}
            >
              Node.js (pnpm)
            </button>
          </div>
          <div className="setup-command">
            <span className="terminal-dollar">$</span>
            <code>
              {sdkTab === "python"
                ? "uv sync && python -m backend.agent dev"
                : "cd agent-node && pnpm install && pnpm run start:dev"}
            </code>
          </div>
          <div className="setup-command">
            <span className="terminal-dollar">$</span>
            <code>
              {sdkTab === "python"
                ? "lk agent init my-agent --template agent-starter-python && lk agent dev"
                : "lk agent init my-agent --template agent-starter-node && lk agent dev"}
            </code>
          </div>
        </div>
      </div>

      <div className="setup-step">
        <span className="step-number">3</span>
        <div>
          <h3>Speak to your agent or deploy to LiveKit Cloud</h3>
          <p>
            Select <strong>Live</strong> in the playground (or open the LiveKit
            Agent Console with agent name <code>my-agent</code>), test in{" "}
            <code>console</code> / <code>dev</code> / <code>start</code> modes,
            or deploy with <code>lk agent create</code>.
          </p>
          {children}
        </div>
      </div>
    </div>
  );
}
