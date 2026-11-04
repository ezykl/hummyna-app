export type SynthCommand =
  | { id: number; type: "init" }
  | { id: number; type: "loadSf2"; data: string }
  | { id: number; type: "loadMidi"; data: string }
  | { id: number; type: "play" }
  | { id: number; type: "pause" }
  | { id: number; type: "stop" }
  | { id: number; type: "seek"; sec: number }
  | { id: number; type: "volume"; value: number };

export type SynthEvent =
  | { type: "ready" }
  | { type: "progress"; sec: number }
  | { type: "loaded"; duration: number }
  | { type: "ended" }
  | { type: "error"; message: string }
  | { type: "ack"; id: number }
  | { type: "nack"; id: number; message: string };

export function encodeCommand(cmd: SynthCommand): string {
  return JSON.stringify(cmd);
}

export function decodeEvent(raw: string): SynthEvent | null {
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && typeof (value as { type?: unknown }).type === "string") {
      return value as SynthEvent;
    }
  } catch {
    // non-JSON or malformed: ignore
  }
  return null;
}

/** Tracks promise-returning commands (init/load*) keyed by request id. */
export class PendingRequests {
  private seq = 0;
  private readonly waiters = new Map<number, { resolve: () => void; reject: (e: Error) => void }>();

  nextId(): number {
    this.seq += 1;
    return this.seq;
  }

  add(id: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
    });
  }

  settle(id: number, error?: Error): void {
    const waiter = this.waiters.get(id);
    if (!waiter) return;
    this.waiters.delete(id);
    if (error) waiter.reject(error);
    else waiter.resolve();
  }

  rejectAll(error: Error): void {
    for (const waiter of this.waiters.values()) waiter.reject(error);
    this.waiters.clear();
  }
}
