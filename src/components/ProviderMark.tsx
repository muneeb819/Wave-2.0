import { Fish, Sparkles } from "lucide-react";

export function ProviderMark({ mark }: { mark: string }) {
  if (mark === "xai") {
    return (
      <span className="provider-mark xai-mark" aria-hidden="true">
        xAI
      </span>
    );
  }
  if (mark === "cartesia") {
    return (
      <span className="provider-mark cartesia-mark" aria-hidden="true">
        C
      </span>
    );
  }
  if (mark === "google") {
    return (
      <span className="provider-mark google-mark" aria-hidden="true">
        G
      </span>
    );
  }
  if (mark === "fish") {
    return (
      <span className="provider-mark fish-mark">
        <Fish aria-hidden="true" />
      </span>
    );
  }
  if (mark === "deepgram") {
    return (
      <span className="provider-mark deepgram-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none">
          <path
            d="M5 4h7a8 8 0 1 1 0 16H5V9h7a3 3 0 0 1 0 6H9"
            stroke="currentColor"
            strokeWidth="2.5"
          />
          <path d="M3 4h3" stroke="currentColor" strokeWidth="2.5" />
        </svg>
      </span>
    );
  }
  if (mark === "assembly") {
    return (
      <span className="provider-mark assembly-mark" aria-hidden="true">
        A
      </span>
    );
  }
  return (
    <span className="provider-mark openai-mark">
      <Sparkles aria-hidden="true" />
    </span>
  );
}
