import { ArrowRight, Cpu, LockKeyhole, Zap } from "lucide-react";

export function FeatureRow() {
  return (
    <div className="feature-row">
      <span>
        <Zap />
        STT-LLM-TTS + Realtime S2S
      </span>
      <i />
      <span>
        <LockKeyhole />
        Keys stay on your server
      </span>
      <i />
      <span>
        <Cpu />
        Python (uv) + Node.js (pnpm)
      </span>
      <a
        href="https://docs.livekit.io/agents/start/voice-ai/"
        target="_blank"
        rel="noreferrer"
      >
        Explore the documentation
        <ArrowRight />
      </a>
    </div>
  );
}
