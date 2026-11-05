import { useCallback, useEffect, useRef, useState } from "react";
import type { MicRecorder, Take } from "./mic-recorder";

export type RecorderStatus = "idle" | "preparing" | "recording" | "saving" | "error";

export interface RecorderController {
  status: RecorderStatus;
  elapsedSec: number;
  level: number; // 0..1
  error: string | null;
  start(): Promise<void>;
  stop(): Promise<Take | null>;
  dispose(): void;
}

/** Root-mean-square level of a PCM frame, clamped to 0..1. */
export function rms(pcm: Float32Array): number {
  if (pcm.length === 0) return 0;
  let sum = 0;
  for (const x of pcm) sum += x * x;
  return Math.min(1, Math.sqrt(sum / pcm.length));
}

export function useRecorder(recorder: MicRecorder, opts: { now?: () => number } = {}): RecorderController {
  const now = opts.now ?? Date.now;
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSec, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const startedAt = useRef(0);
  const unsubscribe = useRef<(() => void) | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setStatus("preparing");
    unsubscribe.current?.();
    unsubscribe.current = null;
    try {
      await recorder.prepare();
      startedAt.current = now();
      unsubscribe.current = recorder.frames((pcm) => {
        setElapsed((now() - startedAt.current) / 1000);
        setLevel(rms(pcm));
      });
      recorder.start();
      setStatus("recording");
    } catch (err) {
      unsubscribe.current?.();
      unsubscribe.current = null;
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }, [recorder, now]);

  const stop = useCallback(async (): Promise<Take | null> => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    setStatus("saving");
    try {
      const take = await recorder.stop();
      setStatus("idle");
      setElapsed(0);
      setLevel(0);
      return take;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      return null;
    }
  }, [recorder]);

  const dispose = useCallback(() => {
    unsubscribe.current?.();
    unsubscribe.current = null;
    recorder.dispose();
  }, [recorder]);

  useEffect(
    () => () => {
      unsubscribe.current?.();
      unsubscribe.current = null;
      recorder.dispose();
    },
    [recorder],
  );

  return { status, elapsedSec, level, error, start, stop, dispose };
}
