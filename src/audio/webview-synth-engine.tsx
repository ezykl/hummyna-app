import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { PendingRequests, decodeEvent, encodeCommand, type SynthCommand } from "./bridge";
import type { AudioEngine, ProgressListener } from "./engine";
import { buildSynthHtml } from "./synth-html";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type Payload = DistributiveOmit<SynthCommand, "id">;

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 without relying on a global `btoa` (not guaranteed on Hermes). */
export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    parts.push(B64[b0 >> 2], B64[((b0 & 3) << 4) | (b1 >> 4)]);
    parts.push(i + 1 < bytes.length ? B64[((b1 & 15) << 2) | (b2 >> 6)] : "=");
    parts.push(i + 2 < bytes.length ? B64[b2 & 63] : "=");
  }
  return parts.join("");
}

export interface SynthOptions {
  libraryJs: string;
  processorJs: string;
  sf2: Uint8Array | null;
}

interface PostTarget {
  postMessage(data: string): void;
}

export class WebViewSynthEngine implements AudioEngine {
  private webview: PostTarget | null = null;
  private readonly pending = new PendingRequests();
  private readonly listeners = new Set<ProgressListener>();
  private readonly errors = new Set<(message: string) => void>();
  private started = false;
  private playing = false;
  private durationSec = 0;
  private volume = 1;
  private readyResolved = false;
  private resolveReady: (() => void) | null = null;
  private readonly whenReady = new Promise<void>((resolve) => {
    this.resolveReady = resolve;
  });

  constructor(private readonly opts: SynthOptions) {}

  /** Called by `SynthHost` once the WebView page has loaded. */
  markReady(): void {
    if (this.readyResolved) return;
    this.readyResolved = true;
    this.resolveReady?.();
  }

  attach(ref: PostTarget | null): void {
    this.webview = ref;
  }

  html(): string {
    return buildSynthHtml({ libraryJs: this.opts.libraryJs, processorJs: this.opts.processorJs });
  }

  onError(cb: (message: string) => void): () => void {
    this.errors.add(cb);
    return () => this.errors.delete(cb);
  }

  private send(cmd: Payload): void {
    this.webview?.postMessage(encodeCommand({ ...cmd, id: 0 } as SynthCommand));
  }

  private request(cmd: Payload): Promise<void> {
    const id = this.pending.nextId();
    const promise = this.pending.add(id);
    this.webview?.postMessage(encodeCommand({ ...cmd, id } as SynthCommand));
    return promise;
  }

  handleMessage(raw: string): void {
    const event = decodeEvent(raw);
    if (!event) return;
    if (event.type === "progress") for (const l of this.listeners) l(event.sec);
    else if (event.type === "loaded") this.durationSec = event.duration;
    else if (event.type === "ack") this.pending.settle(event.id);
    else if (event.type === "nack") this.pending.settle(event.id, new Error(event.message));
    else if (event.type === "error") for (const l of this.errors) l(event.message);
  }

  async init(): Promise<void> {
    await this.whenReady;
    if (!this.started) {
      await this.request({ type: "init" });
      this.started = true;
    }
    if (this.opts.sf2) {
      await this.request({ type: "loadSf2", data: toBase64(this.opts.sf2) });
    }
  }

  async load(midi: Uint8Array): Promise<void> {
    this.durationSec = 0;
    this.playing = false;
    await this.request({ type: "loadMidi", data: toBase64(midi) });
  }

  play(): void {
    this.playing = true;
    this.send({ type: "play" });
  }
  pause(): void {
    this.playing = false;
    this.send({ type: "pause" });
  }
  stop(): void {
    this.playing = false;
    this.send({ type: "stop" });
  }
  seek(sec: number): void {
    this.send({ type: "seek", sec });
  }
  isPlaying(): boolean {
    return this.playing;
  }
  position(): number {
    return 0; // the playhead arrives via onProgress
  }
  duration(): number {
    return this.durationSec;
  }
  setVolume(v: number): void {
    this.volume = v;
    this.send({ type: "volume", value: v });
  }
  onProgress(cb: ProgressListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
  dispose(): void {
    this.listeners.clear();
    this.errors.clear();
    this.pending.rejectAll(new Error("HumMyna: synth disposed"));
    this.webview = null;
  }
}

export function SynthHost({ engine }: { engine: WebViewSynthEngine }) {
  return (
    <WebView
      ref={(ref) => engine.attach(ref)}
      originWhitelist={["*"]}
      javaScriptEnabled
      mediaPlaybackRequiresUserAction={false}
      allowFileAccess
      source={{ html: engine.html() }}
      onLoadEnd={() => engine.markReady()}
      onMessage={(event: WebViewMessageEvent) => engine.handleMessage(event.nativeEvent.data)}
    />
  );
}
