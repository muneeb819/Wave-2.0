import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodeExportModal } from "../src/sections/CodeExportModal";
import { defaultConfig } from "../src/types";

afterEach(cleanup);

describe("CodeExportModal", () => {
  it("renders each export tab filename, copies code, and downloads starter file", () => {
    const onCopy = vi.fn();
    const onNotify = vi.fn();
    const setCodeTab = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(
      <CodeExportModal
        config={defaultConfig}
        codeTab="node"
        setCodeTab={setCodeTab}
        onCopy={onCopy}
        onNotify={onNotify}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("main.ts")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Environment/i }));
    expect(setCodeTab).toHaveBeenCalledWith("env");

    fireEvent.click(screen.getByRole("button", { name: /^Copy$/i }));
    expect(onCopy).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Download main\.ts/i }));
    expect(onNotify).toHaveBeenCalledWith("main.ts downloaded.");
  });
});
