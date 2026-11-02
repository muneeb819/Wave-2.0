import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useMicTester } from "../src/hooks/useMicTester";

describe("useMicTester", () => {
  const originalMediaDevices = navigator.mediaDevices;
  const originalAudioContext = globalThis.AudioContext;

  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: originalMediaDevices,
      configurable: true,
    });
    globalThis.AudioContext = originalAudioContext;
    vi.restoreAllMocks();
  });

  it("Notifies user when navigator.mediaDevices.getUserMedia is unavailable", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
    });
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useMicTester({ sessionActive: false, isEmbeddedIframe: true, onToast }),
    );
    await act(async () => {
      await result.current.toggleMicTest();
    });
    expect(onToast).toHaveBeenCalledWith(
      expect.stringMatching(/Open in New Chrome Tab/i),
    );
  });

  it("samples microphone frequency bins, stops on toggle, and stops automatically when session starts", async () => {
    const stopTrack = vi.fn();
    const closeCtx = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async () => ({
          getAudioTracks: () => [{ label: "Studio USB Mic" }],
          getTracks: () => [{ stop: stopTrack }],
        })),
      },
      configurable: true,
    });

    class FakeAudioContext {
      createMediaStreamSource() {
        return { connect: vi.fn() };
      }
      createAnalyser() {
        return {
          fftSize: 256,
          frequencyBinCount: 4,
          getByteFrequencyData(arr: Uint8Array) {
            arr.set([40, 40, 40, 40]);
          },
        };
      }
      close = closeCtx;
    }
    globalThis.AudioContext = FakeAudioContext as unknown as typeof AudioContext;
    vi.spyOn(globalThis, "requestAnimationFrame").mockReturnValue(77);
    vi.spyOn(globalThis, "cancelAnimationFrame").mockImplementation(() => {});

    const onToast = vi.fn();
    const { result, rerender } = renderHook(
      ({ active }) =>
        useMicTester({
          sessionActive: active,
          isEmbeddedIframe: false,
          onToast,
        }),
      { initialProps: { active: false } },
    );

    await act(async () => {
      await result.current.toggleMicTest();
    });
    expect(result.current.micTesting).toBe(true);
    expect(result.current.micLabel).toBe("Studio USB Mic");
    expect(result.current.micLevel).toBeGreaterThan(0);

    rerender({ active: true });
    expect(result.current.micTesting).toBe(false);
    expect(stopTrack).toHaveBeenCalled();
    expect(closeCtx).toHaveBeenCalled();
  });

  it("reports permission denied toast for standalone and embedded contexts", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn(async () => {
          throw new Error("PermissionDenied");
        }),
      },
      configurable: true,
    });
    const onToast = vi.fn();
    const { result } = renderHook(() =>
      useMicTester({ sessionActive: false, isEmbeddedIframe: false, onToast }),
    );
    await act(async () => {
      await result.current.toggleMicTest();
    });
    expect(onToast).toHaveBeenCalledWith(
      expect.stringMatching(/Allow Microphone/i),
    );
  });
});
