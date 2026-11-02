const CODE_TOKEN_RE =
  /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|#[^\n]*|\/\/[^\n]*|\b(?:from|import|export|default|const|let|async|await|def|class|if|else|as|return|new)\b|\b(?:AgentSession|AgentServer|Agent|STT|LLM|TTS|RealtimeModel|DuplexModel|TurnDetector|STTContextOptions|TurnHandlingOptions)\b)/g;

const KEYWORD_RE =
  /^(from|import|export|default|const|let|async|await|def|class|if|else|as|return|new)$/;

const CLASS_RE =
  /^(AgentSession|AgentServer|Agent|STT|LLM|TTS|RealtimeModel|DuplexModel|TurnDetector|STTContextOptions|TurnHandlingOptions)$/;

export function CodeBlock({
  code,
  lineNumbers = false,
  compact = false,
}: {
  code: string;
  lineNumbers?: boolean;
  compact?: boolean;
}) {
  return (
    <pre className={`code-block ${compact ? "compact" : ""}`}>
      <code>
        {code.split("\n").map((line, index) => (
          <span className="code-line" key={index}>
            {lineNumbers && <span className="line-number">{index + 1}</span>}
            <span>
              {line.split(CODE_TOKEN_RE).map((part, i) => {
                const type = /^['"]/.test(part)
                  ? "string"
                  : part.startsWith("#") || part.startsWith("//")
                    ? "comment"
                    : KEYWORD_RE.test(part)
                      ? "keyword"
                      : CLASS_RE.test(part)
                        ? "class"
                        : "";
                return type ? (
                  <span className={`token-${type}`} key={i}>
                    {part}
                  </span>
                ) : (
                  part
                );
              })}
              {!line && " "}
            </span>
          </span>
        ))}
      </code>
    </pre>
  );
}
