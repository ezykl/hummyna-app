import type { AudioEngine, ProgressListener } from "../../src/audio/engine";

export class FakeEngine implements AudioEngine {
  loaded: Uint8Array | null = null;
  playing = false;
  pos = 0;
  dur = 0;
  volume = 1;
  initCalls = 0;
  private listeners = new Set<ProgressListener>();
  private errorListeners = new Set<(message: string) => void>();

  async init(): Promise<void> {
    this.initCalls += 1;
  }
  async load(midi: Uint8Array): Promise<void> {
    this.loaded = midi;
    this.dur = 180;
    this.pos = 0;
    this.playing = false;
  }
  play(): void {
    this.playing = true;
  }
  pause(): void {
    this.playing = false;
  }
  stop(): void {
    this.playing = false;
    this.pos = 0;
  }
  seek(sec: number): void {
    this.pos = sec;
  }
  isPlaying(): boolean {
    return this.playing;
  }
  position(): number {
    return this.pos;
  }
  duration(): number {
    return this.dur;
  }
  setVolume(value: number): void {
    this.volume = value;
  }
  onProgress(cb: ProgressListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  emitProgress(sec: number): void {
    this.pos = sec;
    for (const listener of this.listeners) listener(sec);
  }
  onError(cb: (message: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }
  emitError(message: string): void {
    for (const listener of this.errorListeners) listener(message);
  }
  dispose(): void {
    this.listeners.clear();
    this.errorListeners.clear();
  }
}
