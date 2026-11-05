import type { FrameListener, MicRecorder, Take } from "../../src/audio/mic-recorder";

export class FakeMicRecorder implements MicRecorder {
  prepared = 0;
  started = 0;
  stopped = 0;
  disposed = 0;
  failPrepare: Error | null = null;
  take: Take = { uri: "file:///take.wav", durationMs: 1234, sampleRate: 44100 };
  private listeners = new Set<FrameListener>();

  get listenerCount(): number {
    return this.listeners.size;
  }

  async prepare(): Promise<void> {
    this.prepared += 1;
    if (this.failPrepare) throw this.failPrepare;
  }
  start(): void {
    this.started += 1;
  }
  frames(cb: FrameListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  async stop(): Promise<Take> {
    this.stopped += 1;
    return this.take;
  }
  emit(pcm: Float32Array, sampleRate = 44100): void {
    for (const listener of this.listeners) listener(pcm, sampleRate);
  }
  dispose(): void {
    this.disposed += 1;
    this.listeners.clear();
  }
}
