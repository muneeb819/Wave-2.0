import { describe, expect, it } from "vitest";
import { envExample, fullAgent, nodeAgent, snippet } from "../src/code";
import { defaultConfig } from "../src/types";

describe("Code Generator Fidelity", () => {
  it("reflects turn_detection strategy in both Python and Node.js snippets and entrypoints", () => {
    const multi = { ...defaultConfig, turn_detection: "multilingual" as const };
    const vad = { ...defaultConfig, turn_detection: "vad" as const };
    const stt = { ...defaultConfig, turn_detection: "stt" as const };

    expect(nodeAgent(multi)).toContain("turnDetection: new inference.TurnDetector()");
    expect(nodeAgent(vad)).toContain('turnDetection: "vad"');
    expect(nodeAgent(stt)).toContain('turnDetection: "stt"');
    expect(snippet(vad, "node")).toContain('turnDetection: "vad"');

    expect(snippet(multi, "python")).toContain("inference.TurnDetector()");
    expect(snippet(vad, "python")).toContain('turn_detection="vad"');
    expect(snippet(stt, "python")).toContain('turn_detection="stt"');
  });

  it("omits keytermsOptions and ai-coustics plugin when disabled and exports realtime duplex config", () => {
    const selfHosted = {
      ...defaultConfig,
      noise_cancellation: false,
      keyterms: [],
    };
    expect(nodeAgent(selfHosted)).not.toContain("audioEnhancement");
    expect(nodeAgent(selfHosted)).not.toContain("keytermsOptions");
    expect(fullAgent(selfHosted)).toContain('"noise_cancellation": False');

    const duplex = {
      ...defaultConfig,
      pipeline: "realtime" as const,
      realtime_model: "openai/gpt-live-1",
      realtime_voice: "marin",
    };
    expect(nodeAgent(duplex)).toContain("inference.DuplexModel");
    expect(snippet(duplex, "python")).toContain("inference.DuplexModel");
    expect(snippet(duplex, "node")).toContain("inference.DuplexModel");
    expect(envExample).toContain("LIVEKIT_URL=");
  });
});
