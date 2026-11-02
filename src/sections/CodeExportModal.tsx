import {
  Copy,
  Download,
  FileCode2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import {
  envExample,
  fullAgent,
  nodeAgent,
  quickstartAgent,
  snippet,
} from "../code";
import { CodeBlock, Modal } from "../components";
import { downloadText } from "../types";
import type { Config } from "../types";

export type CodeTab = "snippet" | "agent" | "quickstart" | "node" | "env";

export function CodeExportModal({
  config,
  codeTab,
  setCodeTab,
  onCopy,
  onNotify,
  onClose,
}: {
  config: Config;
  codeTab: CodeTab;
  setCodeTab: (tab: CodeTab) => void;
  onCopy: (value: string, label?: string) => void;
  onNotify: (message: string) => void;
  onClose: () => void;
}) {
  const code =
    codeTab === "snippet"
      ? snippet(config)
      : codeTab === "agent"
        ? fullAgent(config)
        : codeTab === "quickstart"
          ? quickstartAgent(config)
          : codeTab === "node"
            ? nodeAgent(config)
            : envExample;

  const codeFilename =
    codeTab === "snippet"
      ? "session.py"
      : codeTab === "agent"
        ? "agent.py"
        : codeTab === "quickstart"
          ? "quickstart_agent.py"
          : codeTab === "node"
            ? "main.ts"
            : ".env.example";

  return (
    <Modal
      title="Your stack. Ready to build."
      eyebrow="LIVEKIT AGENTS · PYTHON & NODE.JS SDK"
      size="code-modal"
      onClose={onClose}
    >
      <p className="modal-description">
        Your active{" "}
        <strong>
          {config.pipeline === "realtime"
            ? "Realtime speech-to-speech"
            : "STT → LLM → TTS"}
        </strong>{" "}
        stack translated directly into runnable Python (`uv`) and Node.js
        (`pnpm`) starter code.
      </p>
      <div className="code-modal-tabs">
        {(
          [
            ["snippet", "Session config"],
            ["agent", "Complete agent"],
            ["quickstart", "Quickstart agent.py"],
            ["node", "Node.js starter"],
            ["env", "Environment"],
          ] as const
        ).map(([tab, label]) => (
          <button
            className={codeTab === tab ? "selected" : ""}
            onClick={() => setCodeTab(tab)}
            key={tab}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="modal-code-container">
        <div className="modal-code-filename">
          <FileCode2 />
          <span>{codeFilename}</span>
          <button className="text-button" onClick={() => onCopy(code)}>
            <Copy />
            Copy
          </button>
        </div>
        <CodeBlock code={code} lineNumbers />
      </div>
      <div className="code-run-note">
        <Terminal />
        <span>
          {codeTab === "env"
            ? "Save as .env.local on your server. Never commit your API secret."
            : codeTab === "node"
              ? "cd agent-node && pnpm install && lk agent dev"
              : codeTab === "quickstart"
                ? "uv sync && lk agent dev  (or uv run agent.py console)"
                : codeTab === "agent"
                  ? "uv sync && python -m backend.agent dev"
                  : "See Complete agent, Quickstart agent.py, or Node.js starter for full runnable files."}
        </span>
      </div>
      <div className="modal-footer">
        <span>
          <ShieldCheck />
          Your keys stay server-side.
        </span>
        <button
          className="button primary"
          onClick={() => {
            downloadText(codeFilename, code);
            onNotify(`${codeFilename} downloaded.`);
          }}
        >
          <Download />
          Download {codeFilename}
        </button>
      </div>
    </Modal>
  );
}
