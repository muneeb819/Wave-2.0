import { useCallback, useEffect, useRef, useState } from "react";

export function useMicTester(params: {
  sessionActive: boolean;
  isEmbeddedIframe: boolean;
  onToast: (message: string) => void;
}) {
  const { sessionActive, isEmbeddedIframe, onToast } = params;
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micLabel, setMicLabel] = useState("");
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAudioCtxRef = useRef<AudioContext | null>(null);
  const micRafRef = useRef<number | null>(null);

  const stopMicTest = useCallback(() => {
    if (micRafRef.current !== null) {
      cancelAnimationFrame(micRafRef.current);
      micRafRef.current = null;
    }
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    void micAudioCtxRef.current?.close();
    micAudioCtxRef.current = null;
    setMicTesting(false);
    setMicLevel(0);
  }, []);

  useEffect(() => {
    if (sessionActive && micTesting) stopMicTest();
  }, [sessionActive, micTesting, stopMicTest]);

  useEffect(() => () => stopMicTest(), [stopMicTest]);

  async function toggleMicTest() {
    if (micTesting) {
      stopMicTest();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      onToast(
        "Chrome blocks microphone inside embedded frames — click 'Open in New Chrome Tab' first!",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const trackLabel = stream.getAudioTracks()[0]?.label || "Chrome Microphone";
      setMicLabel(trackLabel);
      const ctx = new AudioContext();
      micAudioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);
      setMicTesting(true);
      onToast(`Microphone ready: ${trackLabel}`);
      const tick = () => {
        analyser.getByteFrequencyData(buffer);
        const avg = buffer.reduce((sum, val) => sum + val, 0) / buffer.length;
        setMicLevel(Math.min(100, Math.round(avg * 1.9)));
        micRafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      onToast(
        isEmbeddedIframe
          ? "Embedded preview blocked mic — click 'Open in New Chrome Tab' to use your Chrome microphone!"
          : "Microphone blocked — click the lock/tune icon in your Chrome address bar and Allow Microphone.",
      );
    }
  }

  return { micTesting, micLevel, micLabel, toggleMicTest };
}
