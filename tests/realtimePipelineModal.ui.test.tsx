import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RealtimePipelineModal } from "../src/sections/RealtimePipelineModal";
import { defaultConfig } from "../src/types";

afterEach(cleanup);

describe("RealtimePipelineModal", () => {
  it("switches between STT-LLM-TTS and Realtime pipelines and updates realtime model", () => {
    const onModelChange = vi.fn();
    const onChangePipeline = vi.fn();
    const onNotify = vi.fn();
    const onClose = vi.fn();

    const { rerender } = render(
      <RealtimePipelineModal
        config={defaultConfig}
        sessionActive={false}
        onModelChange={onModelChange}
        onChangePipeline={onChangePipeline}
        onNotify={onNotify}
        onClose={onClose}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Modal realtime model/i), {
      target: { value: "openai/gpt-live-1" },
    });
    expect(onModelChange).toHaveBeenCalledWith("openai/gpt-live-1");

    fireEvent.click(
      screen.getByRole("button", { name: /Enable Realtime pipeline/i }),
    );
    expect(onChangePipeline).toHaveBeenCalledWith("realtime");

    rerender(
      <RealtimePipelineModal
        config={{ ...defaultConfig, pipeline: "realtime" }}
        sessionActive={false}
        onModelChange={onModelChange}
        onChangePipeline={onChangePipeline}
        onNotify={onNotify}
        onClose={onClose}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /Switch to STT-LLM-TTS/i }),
    );
    expect(onChangePipeline).toHaveBeenCalledWith("stt-llm-tts");
  });
});
