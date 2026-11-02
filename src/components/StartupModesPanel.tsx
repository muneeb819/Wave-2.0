import { Copy, Server } from "lucide-react";

const STARTUP_MODES = [
  {
    mode: "console",
    title: "Console mode",
    cmd: "uv run agent.py console",
    desc: "Run locally in your terminal with direct microphone/speaker I/O.",
  },
  {
    mode: "dev",
    title: "Dev mode",
    cmd: "python -m backend.agent dev",
    desc: "Hot-reload worker connected to LiveKit Cloud, Studio & Agent Console.",
  },
  {
    mode: "start",
    title: "Production start",
    cmd: "python -m backend.agent start",
    desc: "Production worker mode (`lk agent start`).",
  },
  {
    mode: "deploy",
    title: "LiveKit Cloud deploy",
    cmd: "lk agent create",
    desc: "Build the included multi-stage Dockerfile and deploy to LiveKit Cloud.",
  },
] as const;

export function StartupModesPanel({
  onCopy,
}: {
  onCopy: (command: string, label: string) => void;
}) {
  return (
    <section className="panel preferences-panel startup-modes-panel">
      <div className="panel-heading">
        <h2>
          <Server />
          Server startup & deploy modes
        </h2>
      </div>
      <div className="startup-modes-list">
        {STARTUP_MODES.map((item) => (
          <div className="startup-mode-item" key={item.mode}>
            <div className="startup-mode-top">
              <strong>{item.title}</strong>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  onCopy(item.cmd, `Copied "${item.cmd}" to clipboard.`)
                }
              >
                <Copy />
                Copy
              </button>
            </div>
            <p>{item.desc}</p>
            <code>{item.cmd}</code>
          </div>
        ))}
      </div>
    </section>
  );
}
