import { useCallback, useEffect, useState } from "react";
import type { AudioEngine, TransportStatus } from "./engine";

export interface PlayerController {
  status: TransportStatus;
  positionSec: number;
  durationSec: number;
  error: string | null;
  load(midi: Uint8Array): Promise<void>;
  play(): void;
  pause(): void;
  toggle(): void;
  stop(): void;
  seek(sec: number): void;
  setVolume(v: number): void;
}

export function usePlayer(engine: AudioEngine): PlayerController {
  const [status, setStatus] = useState<TransportStatus>("idle");
  const [positionSec, setPositionSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => engine.onProgress(setPositionSec), [engine]);
  useEffect(() => engine.onError?.((message) => setError(message)), [engine]);

  const load = useCallback(
    async (midi: Uint8Array) => {
      setStatus("loading");
      setError(null);
      try {
        await engine.init();
        await engine.load(midi);
        setDurationSec(engine.duration());
        setPositionSec(0);
        setStatus("ready");
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setStatus("error");
      }
    },
    [engine],
  );

  const play = useCallback(() => {
    engine.play();
    setStatus("playing");
  }, [engine]);

  const pause = useCallback(() => {
    engine.pause();
    setStatus("paused");
  }, [engine]);

  const toggle = useCallback(() => {
    if (engine.isPlaying()) {
      engine.pause();
      setStatus("paused");
    } else {
      engine.play();
      setStatus("playing");
    }
  }, [engine]);

  const stop = useCallback(() => {
    engine.stop();
    setPositionSec(0);
    setStatus("ready");
  }, [engine]);

  const seek = useCallback(
    (sec: number) => {
      engine.seek(sec);
      setPositionSec(sec);
    },
    [engine],
  );

  const setVolume = useCallback((value: number) => engine.setVolume(value), [engine]);

  return { status, positionSec, durationSec, error, load, play, pause, toggle, stop, seek, setVolume };
}
