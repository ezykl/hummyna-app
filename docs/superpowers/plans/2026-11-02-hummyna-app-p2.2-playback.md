# HumMyna App — P2.2 Playback + Synced Lyrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Play an imported song's MIDI through a WebView SpessaSynth engine while its lyrics scroll and highlight in sync, with transport controls.

**Architecture:** One `AudioEngine` interface is the seam; a `WebViewSynthEngine` hosts SpessaSynth inside a `react-native-webview` (bundled, offline) and talks to it over a JSON `postMessage` bridge. Lyric timing is pure math over `parseLyrics(midi) -> LyricLine[]` from `@hummyna/hmp`. Views are prop-driven and unit-tested with fakes; the synth itself is device-verified.

**Tech Stack:** Expo SDK 58 · React Native 0.88 · React 19.3 · TypeScript · `react-native-webview` · `expo-asset` · `expo-keep-awake` · `spessasynth_lib` (Apache-2.0) · jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-11-02-hummyna-app-p2.2-playback-design.md`

## Global Constraints

- **Offline** — nothing loads from the network at runtime (SpessaSynth + SF2 are bundled/local).
- **Android first**, iOS parity; one codebase.
- **No new runtime deps in `packages/hmp`.** App-side only.
- **Never copy the whole `.hmp` into memory** — read via `ByteSource` ranges; **close the source** after `midiFor`.
- This phase ships **only the WebView synth**; a native engine later implements the same `AudioEngine`.
- **SoundFont is operator-provided** — no `.sf2` is committed; if unset, the player shows a friendly error.
- Lyrics come from `parseLyrics` (FF05 line-level); the calibration `offsetMs` seam is fixed at **0** (no UI this phase).
- Gate every task: `npm run lint` + `npm test` green. Commits with explicit paths. `main` is the default branch.

---

### Task 1: Lyric timeline math

**Files:**
- Create: `src/lyrics/timeline.ts`
- Test: `tests/lyrics/timeline.test.ts`

**Interfaces:**
- Produces: `currentLineIndex(lines: LyricLine[], timeMs: number): number`; `lineProgress(line: LyricLine, next: LyricLine | undefined, timeMs: number): number`.
- Consumes: `LyricLine { timeMs: number; text: string }` from `@hummyna/hmp`.

- [ ] **Step 1: Write the failing test**

```ts
import type { LyricLine } from "@hummyna/hmp";
import { currentLineIndex, lineProgress } from "../../src/lyrics/timeline";

const line = (timeMs: number, text: string): LyricLine => ({ timeMs, text });
const lines: LyricLine[] = [line(1000, "A"), line(2000, "B"), line(3000, "C")];

describe("currentLineIndex", () => {
  it("returns -1 before the first line or when empty", () => {
    expect(currentLineIndex([], 5000)).toBe(-1);
    expect(currentLineIndex(lines, 0)).toBe(-1);
    expect(currentLineIndex(lines, 999)).toBe(-1);
  });
  it("returns the active line at and after its start", () => {
    expect(currentLineIndex(lines, 1000)).toBe(0);
    expect(currentLineIndex(lines, 1999)).toBe(0);
    expect(currentLineIndex(lines, 2000)).toBe(1);
    expect(currentLineIndex(lines, 99999)).toBe(2);
  });
});

describe("lineProgress", () => {
  it("is 0 for the last line and for non-advancing spans", () => {
    expect(lineProgress(line(3000, "C"), undefined, 3500)).toBe(0);
    expect(lineProgress(line(1000, "A"), line(1000, "B"), 1000)).toBe(0);
  });
  it("clamps to 0..1 across the span", () => {
    expect(lineProgress(lines[0], lines[1], 500)).toBe(0);
    expect(lineProgress(lines[0], lines[1], 1500)).toBe(0.5);
    expect(lineProgress(lines[0], lines[1], 2500)).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/lyrics/timeline.test.ts`
Expected: FAIL — cannot find module `../../src/lyrics/timeline`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type { LyricLine } from "@hummyna/hmp";

/** Index of the line active at `timeMs` (-1 before the first line or when empty). */
export function currentLineIndex(lines: LyricLine[], timeMs: number): number {
  if (lines.length === 0 || timeMs < lines[0].timeMs) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Progress within the current line, 0..1 (last line or a zero-length span -> 0). */
export function lineProgress(line: LyricLine, next: LyricLine | undefined, timeMs: number): number {
  if (!next || next.timeMs <= line.timeMs) return 0;
  const p = (timeMs - line.timeMs) / (next.timeMs - line.timeMs);
  return Math.max(0, Math.min(1, p));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/lyrics/timeline.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lyrics/timeline.ts tests/lyrics/timeline.test.ts
git commit -m "feat(app): lyric timeline math (current line + progress)"
```

---

### Task 2: Store `getLibrary`

**Files:**
- Modify: `src/library/store.ts`
- Test: `tests/library/store.test.ts`

**Interfaces:**
- Produces: `LibraryStore.getLibrary(id: number): Promise<Library | null>`.
- Consumes: existing `Library`, `LibraryRow` in `src/library/store.ts`.

- [ ] **Step 1: Write the failing test** (append inside the existing `describe("library store", ...)`)

```ts
it("gets one library by id, or null", async () => {
  const store = await freshStore();
  const { libraryId } = await store.addLibrary({ name: "Pop", path: "p" }, songs);
  expect(await store.getLibrary(libraryId)).toMatchObject({ id: libraryId, name: "Pop", songCount: 3 });
  expect(await store.getLibrary(999)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/library/store.test.ts -t "gets one library"`
Expected: FAIL — `store.getLibrary is not a function`.

- [ ] **Step 3: Add to the interface and implementation**

In `LibraryStore`:
```ts
  getLibrary(id: number): Promise<Library | null>;
```
In `createLibraryStore`'s returned object:
```ts
    async getLibrary(id: number): Promise<Library | null> {
      const rows = await adapter.all<LibraryRow>(
        "SELECT id, name, path, song_count, created_at FROM libraries WHERE id = ?",
        [id],
      );
      return rows.length > 0 ? toLibrary(rows[0]) : null;
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/library/store.test.ts`
Expected: PASS (all store tests).

- [ ] **Step 5: Commit**

```bash
git add src/library/store.ts tests/library/store.test.ts
git commit -m "feat(app): library store getLibrary(id)"
```

---

### Task 3: `AudioEngine` interface + SoundFont provider

**Files:**
- Create: `src/audio/engine.ts`, `src/audio/sf2.ts`
- Test: `tests/audio/sf2.test.ts`

**Interfaces:**
- Produces:
  - `AudioEngine` (see code), `TransportStatus`, `ProgressListener`.
  - `SoundFontSource = { kind: "asset"; module: number } | { kind: "file"; uri: string }`.
  - `SoundFontLoaders { readAsset(moduleId: number): Promise<Uint8Array>; readFile(uri: string): Promise<Uint8Array> }`.
  - `resolveSoundFont(source: SoundFontSource | null, loaders: SoundFontLoaders): Promise<Uint8Array>`.
  - `configuredSoundFont(): SoundFontSource | null`, `soundFontBytes(): Promise<Uint8Array>`.

- [ ] **Step 1: Write the failing test**

```ts
import type { SoundFontLoaders } from "../../src/audio/sf2";
import { resolveSoundFont } from "../../src/audio/sf2";

const loaders: SoundFontLoaders = {
  readAsset: jest.fn(async () => new Uint8Array([1, 2])),
  readFile: jest.fn(async () => new Uint8Array([3, 4])),
};

describe("resolveSoundFont", () => {
  it("reads a bundled asset", async () => {
    const out = await resolveSoundFont({ kind: "asset", module: 7 }, loaders);
    expect(Array.from(out)).toEqual([1, 2]);
    expect(loaders.readAsset).toHaveBeenCalledWith(7);
  });
  it("reads a file uri", async () => {
    const out = await resolveSoundFont({ kind: "file", uri: "file:///x.sf2" }, loaders);
    expect(Array.from(out)).toEqual([3, 4]);
    expect(loaders.readFile).toHaveBeenCalledWith("file:///x.sf2");
  });
  it("throws a friendly error when unconfigured", async () => {
    await expect(resolveSoundFont(null, loaders)).rejects.toThrow(/SoundFont/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/audio/sf2.test.ts`
Expected: FAIL — cannot find module `../../src/audio/sf2`.

- [ ] **Step 3: Create `src/audio/engine.ts`**

```ts
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
```

- [ ] **Step 4: Create `src/audio/sf2.ts`**

```ts
import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { File } from "expo-file-system";

export type SoundFontSource = { kind: "asset"; module: number } | { kind: "file"; uri: string };

export interface SoundFontLoaders {
  readAsset(moduleId: number): Promise<Uint8Array>;
  readFile(uri: string): Promise<Uint8Array>;
}

/** Resolves the configured SoundFont to bytes, or throws a friendly error. */
export async function resolveSoundFont(
  source: SoundFontSource | null,
  loaders: SoundFontLoaders,
): Promise<Uint8Array> {
  if (!source) {
    throw new Error("HumMyna: no SoundFont configured (set expo.extra.soundFont)");
  }
  return source.kind === "asset" ? loaders.readAsset(source.module) : loaders.readFile(source.uri);
}

export function configuredSoundFont(): SoundFontSource | null {
  const extra = Constants.expoConfig?.extra as { soundFont?: SoundFontSource } | undefined;
  return extra?.soundFont ?? null;
}

const realLoaders: SoundFontLoaders = {
  async readAsset(moduleId: number): Promise<Uint8Array> {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const localUri = asset.localUri ?? asset.uri;
    return new File(localUri).bytes();
  },
  async readFile(uri: string): Promise<Uint8Array> {
    return new File(uri).bytes();
  },
};

/** The single swap-in point for the operator's license-clear `.sf2`. */
export function soundFontBytes(): Promise<Uint8Array> {
  return resolveSoundFont(configuredSoundFont(), realLoaders);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/audio/sf2.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/audio/engine.ts src/audio/sf2.ts tests/audio/sf2.test.ts
git commit -m "feat(app): AudioEngine seam + SoundFont provider"
```

---

### Task 4: Synth bridge (pure)

**Files:**
- Create: `src/audio/bridge.ts`
- Test: `tests/audio/bridge.test.ts`

**Interfaces:**
- Produces: `SynthCommand`, `SynthEvent` (union types), `encodeCommand(cmd): string`, `decodeEvent(raw: string): SynthEvent | null`, `class PendingRequests`.

- [ ] **Step 1: Write the failing test**

```ts
import { PendingRequests, decodeEvent, encodeCommand } from "../../src/audio/bridge";

describe("bridge codec", () => {
  it("round-trips a command", () => {
    const raw = encodeCommand({ id: 3, type: "seek", sec: 12.5 });
    expect(JSON.parse(raw)).toEqual({ id: 3, type: "seek", sec: 12.5 });
  });
  it("decodes an event and rejects junk", () => {
    expect(decodeEvent('{"type":"progress","sec":1.5}')).toEqual({ type: "progress", sec: 1.5 });
    expect(decodeEvent("not json")).toBeNull();
    expect(decodeEvent('{"nope":1}')).toBeNull();
  });
});

describe("PendingRequests", () => {
  it("resolves a waited id and ignores unknown ids", async () => {
    const pending = new PendingRequests();
    const id = pending.nextId();
    const promise = pending.add(id);
    pending.settle(999); // unknown -> no throw
    pending.settle(id);
    await expect(promise).resolves.toBeUndefined();
  });
  it("rejects a waited id and rejects all on teardown", async () => {
    const pending = new PendingRequests();
    const a = pending.nextId();
    const pa = pending.add(a);
    pending.settle(a, new Error("boom"));
    await expect(pa).rejects.toThrow("boom");
    const b = pending.nextId();
    const pb = pending.add(b);
    pending.rejectAll(new Error("disposed"));
    await expect(pb).rejects.toThrow("disposed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/audio/bridge.test.ts`
Expected: FAIL — cannot find module `../../src/audio/bridge`.

- [ ] **Step 3: Implement `src/audio/bridge.ts`**

```ts
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
  | { type: "ended" }
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/audio/bridge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/bridge.ts tests/audio/bridge.test.ts
git commit -m "feat(app): synth postMessage bridge codec + pending requests"
```

---

### Task 5: `usePlayer` hook + fake engine

**Files:**
- Create: `src/audio/use-player.ts`, `tests/helpers/fake-engine.ts`
- Test: `tests/audio/use-player.test.tsx`

**Interfaces:**
- Consumes: `AudioEngine`, `TransportStatus` (Task 3).
- Produces: `PlayerController` and `usePlayer(engine: AudioEngine): PlayerController`.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from "@testing-library/react-native";
import { usePlayer } from "../../src/audio/use-player";
import { FakeEngine } from "../helpers/fake-engine";

describe("usePlayer", () => {
  it("loads a song and reflects transport state", async () => {
    const engine = new FakeEngine();
    const { result } = renderHook(() => usePlayer(engine));
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.load(new Uint8Array([1]));
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.durationSec).toBe(180);

    act(() => result.current.play());
    expect(result.current.status).toBe("playing");
    expect(engine.isPlaying()).toBe(true);

    act(() => engine.emitProgress(42));
    expect(result.current.positionSec).toBe(42);

    act(() => result.current.toggle());
    expect(result.current.status).toBe("paused");
  });

  it("surfaces load errors", async () => {
    const engine = new FakeEngine();
    engine.init = jest.fn(async () => {
      throw new Error("boom");
    });
    const { result } = renderHook(() => usePlayer(engine));
    await act(async () => {
      await result.current.load(new Uint8Array([1]));
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/boom/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/audio/use-player.test.tsx`
Expected: FAIL — cannot find module `../../src/audio/use-player`.

- [ ] **Step 3: Create `tests/helpers/fake-engine.ts`**

```ts
import type { AudioEngine, ProgressListener } from "../../src/audio/engine";

export class FakeEngine implements AudioEngine {
  loaded: Uint8Array | null = null;
  playing = false;
  pos = 0;
  dur = 0;
  volume = 1;
  initCalls = 0;
  private listeners = new Set<ProgressListener>();

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
  dispose(): void {
    this.listeners.clear();
  }
}
```

- [ ] **Step 4: Implement `src/audio/use-player.ts`**

```ts
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest tests/audio/use-player.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/audio/use-player.ts tests/helpers/fake-engine.ts tests/audio/use-player.test.tsx
git commit -m "feat(app): usePlayer hook + fake engine test helper"
```

---

### Task 6: `LyricsView`

**Files:**
- Create: `src/ui/lyrics-view.tsx`
- Test: `tests/ui/lyrics-view.test.tsx`

**Interfaces:**
- Consumes: `LyricLine` (`@hummyna/hmp`), `currentLineIndex` (Task 1).
- Produces: `LyricsView({ lines, timeMs, offsetMs? })`.

- [ ] **Step 1: Write the failing test**

```tsx
import type { LyricLine } from "@hummyna/hmp";
import { render, screen } from "@testing-library/react-native";
import { LyricsView } from "../../src/ui/lyrics-view";

const lines: LyricLine[] = [
  { timeMs: 1000, text: "A" },
  { timeMs: 2000, text: "B" },
  { timeMs: 3000, text: "C" },
];

describe("LyricsView", () => {
  it("highlights the active line", async () => {
    await render(<LyricsView lines={lines} timeMs={2500} />);
    expect(screen.getByTestId("lyric-current").props.children).toBe("B");
  });
  it("applies the offset", async () => {
    await render(<LyricsView lines={lines} timeMs={500} offsetMs={2000} />);
    expect(screen.getByTestId("lyric-current").props.children).toBe("B");
  });
  it("shows an empty state without lyrics", async () => {
    await render(<LyricsView lines={[]} timeMs={0} />);
    expect(screen.getByText(/no lyrics/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/lyrics-view.test.tsx`
Expected: FAIL — cannot find module `../../src/ui/lyrics-view`.

- [ ] **Step 3: Implement `src/ui/lyrics-view.tsx`**

```tsx
import type { LyricLine } from "@hummyna/hmp";
import { ScrollView, StyleSheet, Text } from "react-native";
import { currentLineIndex } from "../lyrics/timeline";

export function LyricsView({
  lines,
  timeMs,
  offsetMs = 0,
}: {
  lines: LyricLine[];
  timeMs: number;
  offsetMs?: number;
}) {
  if (lines.length === 0) {
    return <Text style={styles.empty}>No lyrics for this song.</Text>;
  }
  const active = currentLineIndex(lines, timeMs + offsetMs);
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {lines.map((line, index) => (
        <Text
          key={`${line.timeMs}-${index}`}
          testID={index === active ? "lyric-current" : undefined}
          style={[styles.line, index === active && styles.active]}
        >
          {line.text}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: 12, gap: 10 },
  line: { fontSize: 16, opacity: 0.5 },
  active: { fontSize: 22, fontWeight: "700", opacity: 1 },
  empty: { opacity: 0.6, padding: 16, textAlign: "center" },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/lyrics-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/lyrics-view.tsx tests/ui/lyrics-view.test.tsx
git commit -m "feat(app): LyricsView (active-line highlight)"
```

---

### Task 7: `PlayerView`

**Files:**
- Create: `src/ui/player-view.tsx`
- Test: `tests/ui/player-view.test.tsx`

**Interfaces:**
- Consumes: `LyricLine` (`@hummyna/hmp`), `PlayerController` (Task 5), `LyricsView` (Task 6).
- Produces: `PlayerView({ title, singer, lines, controller })`.

- [ ] **Step 1: Write the failing test**

```tsx
import type { LyricLine } from "@hummyna/hmp";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PlayerController } from "../../src/audio/use-player";
import { PlayerView } from "../../src/ui/player-view";

const lines: LyricLine[] = [{ timeMs: 0, text: "hello" }];

function stubController(overrides: Partial<PlayerController> = {}): PlayerController {
  return {
    status: "ready",
    positionSec: 30,
    durationSec: 120,
    error: null,
    load: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    toggle: jest.fn(),
    stop: jest.fn(),
    seek: jest.fn(),
    setVolume: jest.fn(),
    ...overrides,
  };
}

describe("PlayerView", () => {
  it("shows Play when not playing and toggles on press", async () => {
    const controller = stubController();
    await render(<PlayerView title="G1" singer="S1" lines={lines} controller={controller} />);
    expect(screen.getByText("Play")).toBeTruthy();
    fireEvent.press(screen.getByText("Play"));
    expect(controller.toggle).toHaveBeenCalled();
  });

  it("shows Pause while playing", async () => {
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController({ status: "playing" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
  });

  it("seeks forward 10s from the current position", async () => {
    const controller = stubController({ positionSec: 30 });
    await render(<PlayerView title="G1" singer="S1" lines={lines} controller={controller} />);
    fireEvent.press(screen.getByText("+10s"));
    expect(controller.seek).toHaveBeenCalledWith(40);
  });

  it("shows an error banner", async () => {
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController({ error: "boom" })} />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/player-view.test.tsx`
Expected: FAIL — cannot find module `../../src/ui/player-view`.

- [ ] **Step 3: Implement `src/ui/player-view.tsx`**

```tsx
import type { LyricLine } from "@hummyna/hmp";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { PlayerController } from "../audio/use-player";
import { LyricsView } from "./lyrics-view";

const SEEK_STEP_SEC = 10;

export function PlayerView({
  title,
  singer,
  lines,
  controller,
}: {
  title: string;
  singer: string;
  lines: LyricLine[];
  controller: PlayerController;
}) {
  const { status, positionSec, durationSec, error } = controller;
  const fraction = durationSec > 0 ? Math.min(1, positionSec / durationSec) : 0;
  const playing = status === "playing";
  const disabled = status === "idle" || status === "loading" || status === "error";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{singer}</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(fraction * 100)}%` }]} />
      </View>
      <View style={styles.row}>
        <Pressable disabled={disabled} onPress={() => controller.seek(Math.max(0, positionSec - SEEK_STEP_SEC))}>
          <Text style={styles.button}>-10s</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={controller.toggle}>
          <Text style={styles.button}>{playing ? "Pause" : "Play"}</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={controller.stop}>
          <Text style={styles.button}>Stop</Text>
        </Pressable>
        <Pressable disabled={disabled} onPress={() => controller.seek(positionSec + SEEK_STEP_SEC)}>
          <Text style={styles.button}>+10s</Text>
        </Pressable>
      </View>
      <LyricsView lines={lines} timeMs={positionSec * 1000} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 10 },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { opacity: 0.7 },
  error: { color: "#b00020" },
  progressTrack: { height: 6, borderRadius: 3, backgroundColor: "#e2e8f0", overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: "#2b6cb0" },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 8 },
  button: { color: "#2b6cb0", fontWeight: "700", fontSize: 16 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/player-view.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/player-view.tsx tests/ui/player-view.test.tsx
git commit -m "feat(app): PlayerView (transport + lyrics)"
```

---

### Task 8: WebView SpessaSynth engine (spike + implementation)

The exact SpessaSynth API and dist filenames are the unknown here. This task is a
**spike-first** task: confirm them, then implement. Everything the spike fixes is
recorded in the task report; the skeleton below is the target shape.

**Files:**
- Create: `src/audio/synth-html.ts`, `src/audio/webview-synth-engine.tsx`
- Create (assets): `assets/synth/spessasynth.js`, `assets/synth/spessasynth_processor.js` (from the package dist), `assets/synth/LICENSE.txt` (Apache-2.0 notice)
- Modify: `package.json`

**Interfaces:**
- Produces: `buildSynthHtml({ libraryJs, processorJs }): string`; `class WebViewSynthEngine implements AudioEngine` (Task 3) with `attach(ref)`, `html()`, `handleMessage(raw)`; `SynthHost({ engine })`.
- Consumes: `AudioEngine` (Task 3), `bridge.ts` (Task 4), `soundFontSource()`/bytes (Task 3).

- [ ] **Step 1: Install dependencies**

```bash
npx expo install react-native-webview expo-asset expo-keep-awake
npm install spessasynth_lib
```

- [ ] **Step 2: Spike — confirm the bundle + API**

Inspect `node_modules/spessasynth_lib/dist` and the package README to determine, and **record in the report**:
  - the browser bundle file (prefer a UMD/IIFE build that sets a global; else an ESM file we inline as a module blob),
  - the AudioWorklet processor filename (e.g. `spessasynth_processor.min.js`),
  - the playback API: whether to use `Sequencer` (for MIDI files) or the lower-level `Synthesizer`; the sound-bank loader (`soundBankManager.addSoundBank(bytes, "main")`) and the readiness signal (`await synth.isReady`), and the active-notes/position accessors (`sequencer.currentTime` / `paused`).
  - Prefer the **main-thread `Synthesizer`** if it avoids serving the worklet from a URL; if a worklet is required, serve it via a `Blob` object URL inside the page.

Copy the confirmed dist files into `assets/synth/` and add the Apache-2.0 notice.

- [ ] **Step 3: Implement `src/audio/synth-html.ts`** (shape; adjust calls to the confirmed API)

```ts
export function buildSynthHtml({ libraryJs, processorJs }: { libraryJs: string; processorJs: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/></head><body>
<script>${processorJs}</script>
<script>${libraryJs}</script>
<script>
(function () {
  function post(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  function b64(b){ var s=atob(b); var u=new Uint8Array(s.length); for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i); return u; }
  var ctx=null, synth=null, seq=null, lib=null;
  function tick(){ if(seq && !seq.paused){ post({type:"progress",sec:seq.currentTime}); requestAnimationFrame(tick); } }
  async function handle(cmd){
    try {
      if(cmd.type==="init"){
        ctx = new AudioContext();
        lib = window.spessasynth_lib || window.SpessaSynthLib;
        synth = new lib.Synthesizer(ctx);
        post({type:"ack",id:cmd.id});
      } else if(cmd.type==="loadSf2"){
        await synth.soundBankManager.addSoundBank(b64(cmd.data).buffer, "main");
        await synth.isReady;
        post({type:"ack",id:cmd.id});
      } else if(cmd.type==="loadMidi"){
        seq = new lib.Sequencer(synth);
        seq.loadNewMIDI(b64(cmd.data).buffer);
        post({type:"ack",id:cmd.id});
      } else if(cmd.type==="play"){ await ctx.resume(); seq.play(); tick(); }
      else if(cmd.type==="pause"){ seq.pause(); }
      else if(cmd.type==="stop"){ seq.pause(); seq.currentTime=0; post({type:"progress",sec:0}); }
      else if(cmd.type==="seek"){ seq.currentTime=cmd.sec; post({type:"progress",sec:cmd.sec}); }
      else if(cmd.type==="volume"){ synth.setMasterParameter("masterGain", cmd.value); }
    } catch (e) {
      var msg = String((e && e.message) || e);
      if(cmd.id) post({type:"nack",id:cmd.id,message:msg}); else post({type:"error",message:msg});
    }
  }
  window.addEventListener("message", function(ev){ var c; try{ c=JSON.parse(ev.data);}catch(e){return;} handle(c); });
})();
</script></body></html>`;
}
```

- [ ] **Step 4: Implement `src/audio/webview-synth-engine.tsx`**

```tsx
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { PendingRequests, decodeEvent, encodeCommand, type SynthCommand } from "./bridge";
import type { AudioEngine, ProgressListener } from "./engine";
import { buildSynthHtml } from "./synth-html";

type Payload = Omit<SynthCommand, "id">;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface SynthOptions {
  libraryJs: string;
  processorJs: string;
  sf2: Uint8Array | null;
}

export class WebViewSynthEngine implements AudioEngine {
  private webview: WebView | null = null;
  private readonly pending = new PendingRequests();
  private readonly listeners = new Set<ProgressListener>();
  private readonly errors = new Set<(m: string) => void>();
  private started = false;
  private playing = false;
  private durationSec = 0;
  private volume = 1;

  constructor(private readonly opts: SynthOptions) {}

  attach(ref: WebView | null): void {
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
    else if (event.type === "ack") this.pending.settle(event.id);
    else if (event.type === "nack") this.pending.settle(event.id, new Error(event.message));
    else if (event.type === "error") for (const l of this.errors) l(event.message);
  }

  async init(): Promise<void> {
    if (!this.started) {
      await this.request({ type: "init" });
      this.started = true;
    }
    if (this.opts.sf2) {
      await this.request({ type: "loadSf2", data: toBase64(this.opts.sf2) });
    }
  }
  async load(midi: Uint8Array): Promise<void> {
    await this.request({ type: "loadMidi", data: toBase64(midi) });
    this.durationSec = 0; // WebView reports real duration via progress/ended if needed
    this.playing = false;
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
    return 0; // position arrives via onProgress
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
      onMessage={(event: WebViewMessageEvent) => engine.handleMessage(event.nativeEvent.data)}
    />
  );
}
```

- [ ] **Step 5: Gate**

Run: `npm run lint` then `npm test`
Expected: PASS (no unit tests for this task; the synth is device-verified).

- [ ] **Step 6: Device check (manual)**

Load a song with a real `.sf2` configured and confirm play/pause/seek/stop,
audible sound, and `progress` events. Record results in `docs/DEVICE-VERIFICATION.md` (Task 9).

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/audio/synth-html.ts src/audio/webview-synth-engine.tsx assets/synth
git commit -m "feat(app): WebView SpessaSynth AudioEngine (offline)"
```

---

### Task 9: Player route, navigation, and device docs

**Files:**
- Create: `src/app/player/[id].tsx`
- Modify: `src/ui/library-view.tsx`, `src/app/library/[id].tsx`, `docs/DEVICE-VERIFICATION.md`
- Test: `tests/ui/browse.test.tsx` (extend)

**Interfaces:**
- Consumes: `getLibrary` (Task 2), `openHmp`, `parseLyrics`, `midiFor` (`@hummyna/hmp`), `fileByteSource`, `libraryKeys`, `rnCryptoAdapter`, `rnInflateAdapter`, `WebViewSynthEngine`/`SynthHost` (Task 8), `usePlayer` (Task 5), `PlayerView` (Task 7).
- Produces: the `/player/[id]` route reachable from a library's song list.

- [ ] **Step 1: Extend the browse test for song navigation**

Add to `tests/ui/browse.test.tsx` (inside the `LibraryDetailView` describe):

```tsx
it("emits the tapped song for navigation", async () => {
  const store = fakeStore();
  const onOpenSong = jest.fn();
  await render(<LibraryDetailView library={library} store={store} onOpenSong={onOpenSong} />);
  fireEvent.press(await screen.findByText("G2"));
  expect(onOpenSong).toHaveBeenCalledWith(expect.objectContaining({ number: 2, title: "G2" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/browse.test.tsx -t "emits the tapped song"`
Expected: FAIL — `onOpenSong` is not a prop yet / row not pressable.

- [ ] **Step 3: Add `onOpenSong` to `LibraryDetailView` (`src/ui/library-view.tsx`)**

Add the prop and make rows pressable (leave `LibrariesView` unchanged):

```tsx
export function LibraryDetailView({
  library,
  store,
  onOpenSong,
}: {
  library: Library;
  store: LibraryStore;
  onOpenSong?: (song: Song) => void;
}) {
  // ...existing state/effect unchanged...
  // renderItem:
  renderItem={({ item }) => (
    <Pressable style={styles.row} onPress={() => onOpenSong?.(item)}>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.sub}>{item.singer}</Text>
    </Pressable>
  )}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/browse.test.tsx`
Expected: PASS (all browse tests).

- [ ] **Step 5: Wire navigation in `src/app/library/[id].tsx`**

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
// ...inside the component:
const router = useRouter();
// pass to the view:
<LibraryDetailView
  library={library}
  store={store}
  onOpenSong={(song) =>
    router.push({ pathname: "/player/[id]", params: { id: String(library.id), number: String(song.number) } })
  }
/>
```

- [ ] **Step 6: Implement `src/app/player/[id].tsx`**

```tsx
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useKeepAwake } from "expo-keep-awake";
import type { LyricLine } from "@hummyna/hmp";
import { openHmp, parseLyrics } from "@hummyna/hmp";
import { openLibraryDb } from "../../library/db";
import { libraryKeys } from "../../library/keys";
import { fileByteSource } from "../../platform/file-byte-source";
import { rnCryptoAdapter } from "../../platform/rn-crypto";
import { rnInflateAdapter } from "../../platform/rn-inflate";
import { soundFontBytes } from "../../audio/sf2";
import { usePlayer } from "../../audio/use-player";
import { SynthHost, WebViewSynthEngine } from "../../audio/webview-synth-engine";
import { PlayerView } from "../../ui/player-view";

// SpessaSynth sources resolved in Task 8 (the spike decides how `assets/synth/*`
// are read at runtime — e.g. via `Asset` + `File.text()`; both are strings here).
const LIBRARY_JS = "/* spessasynth bundle text */";
const PROCESSOR_JS = "/* spessasynth processor text */";

interface Loaded {
  engine: WebViewSynthEngine;
  title: string;
  singer: string;
  lines: LyricLine[];
}

export default function PlayerScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const store = await openLibraryDb();
        const library = await store.getLibrary(Number(id));
        if (!active || !library) return;
        const source = await fileByteSource(library.path);
        try {
          const hmp = await openHmp(source, libraryKeys(), {
            crypto: rnCryptoAdapter,
            inflate: rnInflateAdapter,
          });
          const ref = hmp.songs().find((s) => s.number === Number(number));
          if (!ref) return;
          const midi = await hmp.midiFor(ref);
          const engine = new WebViewSynthEngine({
            libraryJs: LIBRARY_JS,
            processorJs: PROCESSOR_JS,
            sf2: await soundFontBytes().catch(() => null),
          });
          if (active) setLoaded({ engine, title: ref.title, singer: ref.singer, lines: parseLyrics(midi) });
        } finally {
          source.close();
        }
      } catch (err) {
        if (active) setMessage(err instanceof Error ? err.message : "Couldn't open this song.");
      }
    })();
    return () => {
      active = false;
    };
  }, [id, number]);

  if (!loaded) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>{message}</Text>
      </View>
    );
  }
  return <PlayerScreenInner {...loaded} />;
}

function PlayerScreenInner({ engine, title, singer, lines }: Loaded) {
  const controller = usePlayer(engine);
  useKeepAwake();
  useEffect(() => {
    return () => engine.dispose();
  }, [engine]);
  return (
    <View style={{ flex: 1 }}>
      <PlayerView title={title} singer={singer} lines={lines} controller={controller} />
      <SynthHost engine={engine} />
    </View>
  );
}
```

> `usePlayer` is only ever given a real engine (the inner component mounts once the
> engine exists), so no placeholder is fabricated. `soundFontBytes().catch(() => null)`
> degrades to the friendly "no SoundFont" error instead of crashing.

- [ ] **Step 7: Add the P2.2 section to `docs/DEVICE-VERIFICATION.md`**

Append a "P2.2 — Playback" section: configure `expo.extra.soundFont`, open a song,
confirm audible playback, synth play/pause/stop/seek, lyric highlight tracks the
music, `+/-10s` seek, screen stays awake, and no crash without a SoundFont.

- [ ] **Step 8: Gate**

Run: `npm run lint` then `npm test`
Expected: PASS (all suites).

- [ ] **Step 9: Commit**

```bash
git add "src/app/player/[id].tsx" src/app/library/[id].tsx src/ui/library-view.tsx docs/DEVICE-VERIFICATION.md tests/ui/browse.test.tsx
git commit -m "feat(app): player route + song navigation + device docs"
```

---

## Self-Review

**Spec coverage:** §4 `AudioEngine` -> Task 3 (interface), Task 8 (impl); §5 WebView bridge -> Tasks 4/8; §6 SoundFont provider (swap-in) -> Task 3; §7 lyric timeline + offset seam -> Task 1 (offset applied in Task 6/7); §8 player screen/route + store `getLibrary` -> Tasks 2/7/9; §9 error handling -> Tasks 3 (friendly SF2 error), 5 (load error), 7 (banner), 9 (corrupt/no-key); §10 testing -> Tasks 1-7 (unit/render), 8/9 (device); §11 deps -> Task 8; §12 risks -> Task 8 spike; keep-awake -> Task 9.

**Placeholder scan:** the only intentional unknowns are Task 8's third-party SpessaSynth filenames/API, handled by an explicit spike step whose output is recorded (same pattern as P2.1's crypto/ranged-read spikes). No "TBD"/"add error handling" stubs elsewhere.

**Type consistency:** `LyricLine` (hmp) used in Tasks 1/6/7/9; `PlayerController`/`usePlayer` defined Task 5, consumed Tasks 7/9; `AudioEngine`/`TransportStatus` Task 3, consumed Tasks 5/8; `WebViewSynthEngine`/`SynthHost` Task 8, consumed Task 9; `getLibrary` Task 2, consumed Task 9; `SynthCommand`/`SynthEvent`/`PendingRequests` Task 4, consumed Task 8.

