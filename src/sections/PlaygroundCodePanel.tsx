import { useState } from "react";
import { Braces, Check, ChevronRight, Cloud, Code2 } from "lucide-react";
import { snippet } from "../code";
import { CodeBlock, CopyButton } from "../components";
import { copyText } from "../types";
import type { Config, SdkKind } from "../types";

export function PlaygroundCodePanel({
  config,
  onCode,
  onToast,
}: {
  config: Config;
  onCode: () => void;
  onToast: (message: string) => void;
}) {
  const [sdk, setSdk] = useState<SdkKind>("python");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await copyText(snippet(config, sdk));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      onToast(
        sdk === "python"
          ? "Python configuration copied."
          : "Node.js configuration copied.",
      );
    } catch (error) {
      onToast((error as Error).message);
    }
  }

  return (
    <section className="code-panel panel" aria-label="Quick start code">
      <div className="panel-heading">
        <h2>
          <span className="heading-icon">
            <Code2 />
          </span>
          Your stack in code
        </h2>
        <div className="code-toolbar">
          <div className="mode-switch sdk-switch" aria-label="SDK language">
            <button
              type="button"
              className={sdk === "python" ? "selected" : ""}
              onClick={() => setSdk("python")}
              aria-pressed={sdk === "python"}
            >
              Python
            </button>
            <button
              type="button"
              className={sdk === "node" ? "selected" : ""}
              onClick={() => setSdk("node")}
              aria-pressed={sdk === "node"}
            >
              Node.js
            </button>
          </div>
          <CopyButton onClick={() => void copy()} copied={copied} />
        </div>
      </div>
      <div className="code-filename">
        <Braces />
        <span>{sdk === "python" ? "agent.py" : "src/main.ts"}</span>
        <span className="code-sync-indicator">
          <Check />
          Synced with your{" "}
          {config.pipeline === "realtime" ? "realtime model" : "models"}
        </span>
      </div>
      <CodeBlock code={snippet(config, sdk)} lineNumbers compact />
      <div className="code-panel-note">
        <div className="shield-note">
          <Cloud />
          <span className="shield-tiny-check">
            <Check />
          </span>
        </div>
        <p>
          One set of Cloud credentials.
          <br />
          <span>No separate provider API keys.</span>
        </p>
      </div>
      <button className="code-panel-footer" onClick={onCode}>
        <span>Get the complete agent</span>
        <ChevronRight />
      </button>
    </section>
  );
}
