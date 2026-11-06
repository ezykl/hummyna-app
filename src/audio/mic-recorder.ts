export interface Take {
  uri: string;
  durationMs: number;
  sampleRate?: number;
}

export type FrameListener = (pcm: Float32Array, sampleRate: number) => void;

/** One mic capture that feeds both the saved take and PCM consumers. */
export interface MicRecorder {
  /** Request mic permission + configure the audio session. Idempotent. */
  prepare(): Promise<void>;
  start(): void;
  /** Subscribe to PCM frames; returns an unsubscribe. */
  frames(cb: FrameListener): () => void;
  stop(): Promise<Take>;
  dispose(): void;
}
