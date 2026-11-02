export type ProgressListener = (sec: number) => void;

/** The playback seam: a WebView synth now, a native engine later. */
export interface AudioEngine {
  /** Boot the synth and prepare it (idempotent). */
  init(): Promise<void>;
  /** Replace the current song (MIDI file bytes). */
  load(midi: Uint8Array): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  isPlaying(): boolean;
  /** Playhead position in seconds. */
  position(): number;
  /** Song length in seconds (0 until loaded). */
  duration(): number;
  setVolume(v: number): void;
  /** Subscribe to playhead updates; returns an unsubscribe. */
  onProgress(cb: ProgressListener): () => void;
  dispose(): void;
}

export type TransportStatus = "idle" | "loading" | "ready" | "playing" | "paused" | "error";
