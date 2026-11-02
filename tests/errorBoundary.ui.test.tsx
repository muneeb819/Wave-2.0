import { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function CrashableView() {
  const [crash, setCrash] = useState(true);
  if (crash) {
    throw new Error("Simulated pipeline widget failure");
  }
  return <p>Healthy Studio View</p>;
}

describe("React ErrorBoundary", () => {
  it("catches render exceptions, reports them to onError, and recovers cleanly", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary onError={onError}>
        <CrashableView />
      </ErrorBoundary>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Studio encountered an unexpected error.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Simulated pipeline widget failure",
    );
    expect(onError).toHaveBeenCalledTimes(1);

    rerender(
      <ErrorBoundary onError={onError}>
        <p>Recovered Studio View</p>
      </ErrorBoundary>,
    );
    await user.click(screen.getByRole("button", { name: /Recover Studio/i }));
    expect(screen.getByText("Recovered Studio View")).toBeInTheDocument();
    spy.mockRestore();
  });
});
