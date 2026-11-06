# HumMyna App — P2.3 Recording (Sing-along) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the player, record the mic while the backing track plays, save the voice as a WAV take, and list/play/delete takes per song — one capture that also yields live PCM frames for future scoring.

**Architecture:** A `MicRecorder` interface (spec §4) with an `expo-audio` `AudioStream` implementation (real-time PCM + WAV file, no native module). Take metadata lives in SQLite via the existing `SqliteAdapter` seam; views are prop-driven and unit-tested with a fake recorder; the routes wire native + navigation and are device-verified.

**Tech Stack:** Expo SDK 58 · React Native 0.88 · `expo-audio` (`AudioStream`) · `expo-file-system` · SQLite (existing seam) · jest-expo + `@testing-library/react-native`.

**Spec:** `docs/superpowers/specs/2026-11-05-hummyna-app-p2.3-recording-design.md`

## Global Constraints

- **Mic monitoring is OFF** — never route the mic input back to output (feedback).
- **Never store bytes in SQLite** — takes store only `{ libraryId, number, path, createdAt, durationMs }`.
- Takes are **WAV** files under the app Documents dir; playback is voice-only this phase.
- Capture uses **`expo-audio` `AudioStream`** (no custom NDK module). Android-first.
- Reuse the existing **`SqliteAdapter`** seam; the DB is opened via `src/library/db.ts`.
- Gate every task: `npm run lint` + `npm test` green. Commits with explicit paths. `main` is the default branch.

---

### Task 1: Takes store

**Files:**
- Create: `src/library/takes.ts`
- Modify: `src/library/db.ts`
- Test: `tests/library/takes.test.ts`

**Interfaces:**
- Consumes: `SqliteAdapter`, `SqlValue` from `src/library/store.ts`.
- Produces: `TakeRecord`, `NewTake`, `TakesStore`, `TAKES_SCHEMA`, `migrateTakes(adapter)`, `createTakesStore(adapter)`, and `openTakesStore(name?)` from `db.ts`.

- [ ] **Step 1: Write the failing test**

```ts
import { DatabaseSync } from "node:sqlite";
import type { SqliteAdapter, SqlValue } from "../../src/library/store";
import { createTakesStore, migrateTakes } from "../../src/library/takes";

function nodeAdapter(db: DatabaseSync): SqliteAdapter {
  return {
    exec: async (sql: string) => {
      db.exec(sql);
    },
    run: async (sql: string, params: SqlValue[] = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    all: async <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
  };
}

async function freshStore() {
  const db = new DatabaseSync(":memory:");
  const adapter = nodeAdapter(db);
  await migrateTakes(adapter);
  return createTakesStore(adapter);
}

describe("takes store", () => {
  it("adds, lists (newest first), gets, and deletes takes", async () => {
    const store = await freshStore();
    const a = await store.addTake({ libraryId: 1, number: 2, path: "takes/a.wav", durationMs: 1000 });
    const b = await store.addTake({ libraryId: 1, number: 2, path: "takes/b.wav", durationMs: 2000 });
    await store.addTake({ libraryId: 1, number: 9, path: "takes/other.wav", durationMs: 5 });

    const list = await store.listTakes(1, 2);
    expect(list.map((t) => t.id)).toEqual([b, a]);
    expect(list[0]).toMatchObject({ path: "takes/b.wav", durationMs: 2000, libraryId: 1, number: 2 });

    expect(await store.getTake(a)).toMatchObject({ id: a, path: "takes/a.wav" });
    expect(await store.getTake(999)).toBeNull();

    await store.deleteTake(a);
    expect((await store.listTakes(1, 2)).map((t) => t.id)).toEqual([b]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/library/takes.test.ts`
Expected: FAIL — cannot find module `../../src/library/takes`.

- [ ] **Step 3: Create `src/library/takes.ts`**

```ts
import type { SqliteAdapter, SqlValue } from "./store";

export interface TakeRecord {
  id: number;
  libraryId: number;
  number: number;
  path: string;
  createdAt: number;
  durationMs: number;
}

export interface NewTake {
  libraryId: number;
  number: number;
  path: string;
  durationMs: number;
}

export interface TakesStore {
  addTake(input: NewTake): Promise<number>;
  listTakes(libraryId: number, number: number): Promise<TakeRecord[]>;
  getTake(id: number): Promise<TakeRecord | null>;
  deleteTake(id: number): Promise<void>;
}

export const TAKES_SCHEMA = `
CREATE TABLE IF NOT EXISTS takes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_takes_song ON takes(library_id, number);
`;

interface TakeRow {
  id: number;
  library_id: number;
  number: number;
  path: string;
  created_at: number;
  duration_ms: number;
}

const toTake = (r: TakeRow): TakeRecord => ({
  id: r.id,
  libraryId: r.library_id,
  number: r.number,
  path: r.path,
  createdAt: r.created_at,
  durationMs: r.duration_ms,
});

export async function migrateTakes(adapter: SqliteAdapter): Promise<void> {
  await adapter.exec(TAKES_SCHEMA);
}

export function createTakesStore(adapter: SqliteAdapter): TakesStore {
  return {
    async addTake(input: NewTake): Promise<number> {
      const { lastInsertRowid } = await adapter.run(
        "INSERT INTO takes (library_id, number, path, created_at, duration_ms) VALUES (?, ?, ?, ?, ?)",
        [input.libraryId, input.number, input.path, Date.now(), input.durationMs],
      );
      return lastInsertRowid;
    },

    async listTakes(libraryId: number, number: number): Promise<TakeRecord[]> {
      const rows = await adapter.all<TakeRow>(
        "SELECT * FROM takes WHERE library_id = ? AND number = ? ORDER BY created_at DESC, id DESC",
        [libraryId, number],
      );
      return rows.map(toTake);
    },

    async getTake(id: number): Promise<TakeRecord | null> {
      const rows = await adapter.all<TakeRow>("SELECT * FROM takes WHERE id = ?", [id]);
      return rows.length > 0 ? toTake(rows[0]) : null;
    },

    async deleteTake(id: number): Promise<void> {
      await adapter.run("DELETE FROM takes WHERE id = ?", [id]);
    },
  };
}

export type { SqlValue };
```

- [ ] **Step 4: Refactor `src/library/db.ts` to share one adapter and add `openTakesStore`**

Replace the `cached`/`openLibraryDb` block with:

```ts
import { createTakesStore, migrateTakes } from "./takes";
import type { TakesStore } from "./takes";
// ...existing imports (SQLite, store)...

let cachedAdapter: Promise<SqliteAdapter> | undefined;

function openAdapter(name: string): Promise<SqliteAdapter> {
  if (!cachedAdapter) {
    cachedAdapter = (async () => {
      const db = SQLite.openDatabaseSync(name);
      const adapter = expoSqliteAdapter(db);
      await migrate(adapter);
      await migrateTakes(adapter);
      return adapter;
    })().catch((err) => {
      cachedAdapter = undefined; // a transient open/migrate failure must not poison future calls
      throw err;
    });
  }
  return cachedAdapter;
}

export async function openLibraryDb(name = "hummyna.db"): Promise<LibraryStore> {
  return createLibraryStore(await openAdapter(name));
}

export async function openTakesStore(name = "hummyna.db"): Promise<TakesStore> {
  return createTakesStore(await openAdapter(name));
}
```

(Keep the existing `export * from "./store";` and `expoSqliteAdapter`.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/library/takes.test.ts && npm run lint`
Expected: PASS (1 test) + clean tsc.

- [ ] **Step 6: Commit**

```bash
git add src/library/takes.ts src/library/db.ts tests/library/takes.test.ts
git commit -m "feat(app): sqlite takes store"
```

---

### Task 2: `MicRecorder` interface + `useRecorder` hook

**Files:**
- Create: `src/audio/mic-recorder.ts`, `src/audio/use-recorder.ts`, `tests/helpers/fake-mic-recorder.ts`
- Test: `tests/audio/use-recorder.test.tsx`

**Interfaces:**
- Produces: `Take { uri, durationMs, sampleRate? }`, `FrameListener`, `MicRecorder { prepare, start, frames, stop, dispose }`; `rms(pcm)`; `RecorderStatus`, `RecorderController`, `useRecorder(recorder, { now? })`.
- Consumes: nothing earlier.

- [ ] **Step 1: Write the failing test**

```tsx
import { act, renderHook } from "@testing-library/react-native";
import { useRecorder } from "../../src/audio/use-recorder";
import { FakeMicRecorder } from "../helpers/fake-mic-recorder";

describe("useRecorder", () => {
  it("records: prepare, start, level + elapsed from frames, stop returns a take", async () => {
    let clock = 0;
    const rec = new FakeMicRecorder();
    const { result } = await renderHook(() => useRecorder(rec, { now: () => clock }));
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.start();
    });
    expect(rec.prepared).toBe(1);
    expect(rec.started).toBe(1);
    expect(result.current.status).toBe("recording");

    clock = 500;
    await act(async () => {
      rec.emit(new Float32Array([0.5, -0.5, 0.5, -0.5]));
    });
    expect(result.current.elapsedSec).toBe(0.5);
    expect(result.current.level).toBeCloseTo(0.5, 5);

    let take = null as Awaited<ReturnType<typeof result.current.stop>>;
    await act(async () => {
      take = await result.current.stop();
    });
    expect(take).toMatchObject({ uri: "file:///take.wav" });
    expect(result.current.status).toBe("idle");
  });

  it("surfaces a permission error from prepare", async () => {
    const rec = new FakeMicRecorder();
    rec.failPrepare = new Error("mic denied");
    const { result } = await renderHook(() => useRecorder(rec));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/mic denied/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/audio/use-recorder.test.tsx`
Expected: FAIL — cannot find module `../../src/audio/use-recorder`.

- [ ] **Step 3: Create `src/audio/mic-recorder.ts`**

```ts
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
```

- [ ] **Step 4: Create `tests/helpers/fake-mic-recorder.ts`**

```ts
import type { FrameListener, MicRecorder, Take } from "../../src/audio/mic-recorder";

export class FakeMicRecorder implements MicRecorder {
  prepared = 0;
  started = 0;
  stopped = 0;
  failPrepare: Error | null = null;
  take: Take = { uri: "file:///take.wav", durationMs: 1234, sampleRate: 44100 };
  private listeners = new Set<FrameListener>();

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
    this.listeners.clear();
  }
}
```

- [ ] **Step 5: Create `src/audio/use-recorder.ts`**

```ts
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

  useEffect(() => () => unsubscribe.current?.(), []);

  return { status, elapsedSec, level, error, start, stop, dispose };
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx jest tests/audio/use-recorder.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/audio/mic-recorder.ts src/audio/use-recorder.ts tests/helpers/fake-mic-recorder.ts tests/audio/use-recorder.test.tsx
git commit -m "feat(app): MicRecorder interface + useRecorder hook"
```

---

### Task 3: `RecordView`

**Files:**
- Create: `src/ui/record-view.tsx`
- Test: `tests/ui/record-view.test.tsx`

**Interfaces:**
- Consumes: `RecorderStatus` from `src/audio/use-recorder.ts`.
- Produces: `formatElapsed(sec)`, `RecordView({ title, singer, status, elapsedSec, level, error, onStart, onStop })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { RecordView, formatElapsed } from "../../src/ui/record-view";

describe("RecordView", () => {
  it("shows Record and starts", async () => {
    const onStart = jest.fn();
    await render(
      <RecordView title="G1" singer="S1" status="idle" elapsedSec={0} level={0} error={null} onStart={onStart} onStop={jest.fn()} />,
    );
    fireEvent.press(screen.getByText("Record"));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows Stop while recording and stops", async () => {
    const onStop = jest.fn();
    await render(
      <RecordView title="G1" singer="S1" status="recording" elapsedSec={5} level={0.5} error={null} onStart={jest.fn()} onStop={onStop} />,
    );
    expect(screen.getByText("Stop")).toBeTruthy();
    fireEvent.press(screen.getByText("Stop"));
    expect(onStop).toHaveBeenCalled();
  });

  it("shows an error and formats elapsed", async () => {
    await render(
      <RecordView title="G1" singer="S1" status="error" elapsedSec={65} level={0} error="mic denied" onStart={jest.fn()} onStop={jest.fn()} />,
    );
    expect(screen.getByTestId("recorder-error")).toBeTruthy();
    expect(formatElapsed(65)).toBe("1:05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/record-view.test.tsx`
Expected: FAIL — cannot find module `../../src/ui/record-view`.

- [ ] **Step 3: Implement `src/ui/record-view.tsx`**

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecorderStatus } from "../audio/use-recorder";

export function formatElapsed(sec: number): string {
  const total = Math.max(0, Math.floor(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function RecordView({
  title,
  singer,
  status,
  elapsedSec,
  level,
  error,
  onStart,
  onStop,
}: {
  title: string;
  singer: string;
  status: RecorderStatus;
  elapsedSec: number;
  level: number;
  error: string | null;
  onStart: () => void;
  onStop: () => void;
}) {
  const recording = status === "recording";
  const busy = status === "preparing" || status === "saving";

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.sub}>{singer}</Text>
      {error ? (
        <Text testID="recorder-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.round(Math.min(1, level) * 100)}%` }]} />
      </View>
      <Text style={styles.time}>{formatElapsed(elapsedSec)}</Text>
      <Pressable
        style={[styles.button, busy && styles.buttonDisabled]}
        disabled={busy}
        onPress={recording ? onStop : onStart}
      >
        <Text style={styles.buttonText}>{recording ? "Stop" : "Record"}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700" },
  sub: { opacity: 0.7 },
  error: { color: "#b00020" },
  meterTrack: { width: "80%", height: 10, borderRadius: 5, backgroundColor: "#e2e8f0", overflow: "hidden" },
  meterFill: { height: 10, backgroundColor: "#2f855a" },
  time: { fontSize: 28, fontVariant: ["tabular-nums"] },
  button: { backgroundColor: "#c53030", paddingHorizontal: 28, paddingVertical: 14, borderRadius: 8 },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "white", fontWeight: "700", fontSize: 16 },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/record-view.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/record-view.tsx tests/ui/record-view.test.tsx
git commit -m "feat(app): RecordView (record/stop + meter)"
```

---

### Task 4: `TakesView`

**Files:**
- Create: `src/ui/takes-view.tsx`
- Test: `tests/ui/takes-view.test.tsx`

**Interfaces:**
- Consumes: `TakeRecord` from `src/library/takes.ts` (Task 1).
- Produces: `formatDuration(ms)`, `formatTakeDate(ms)`, `TakesView({ takes, onPlay, onDelete })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { TakeRecord } from "../../src/library/takes";
import { TakesView, formatDuration } from "../../src/ui/takes-view";

const take: TakeRecord = {
  id: 1,
  libraryId: 1,
  number: 2,
  path: "takes/a.wav",
  createdAt: Date.UTC(2026, 0, 3),
  durationMs: 65000,
};

describe("TakesView", () => {
  it("lists a take and wires play/delete", async () => {
    const onPlay = jest.fn();
    const onDelete = jest.fn();
    await render(<TakesView takes={[take]} onPlay={onPlay} onDelete={onDelete} />);
    expect(screen.getByText(/2026-01-03/)).toBeTruthy();
    fireEvent.press(screen.getByText("Play"));
    expect(onPlay).toHaveBeenCalledWith(take);
    fireEvent.press(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(take);
  });

  it("shows an empty state and formats duration", async () => {
    await render(<TakesView takes={[]} onPlay={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getByText(/no takes/i)).toBeTruthy();
    expect(formatDuration(65000)).toBe("1:05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/takes-view.test.tsx`
Expected: FAIL — cannot find module `../../src/ui/takes-view`.

- [ ] **Step 3: Implement `src/ui/takes-view.tsx`**

```tsx
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TakeRecord } from "../library/takes";

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function formatTakeDate(ms: number): string {
  const d = new Date(ms);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function TakesView({
  takes,
  onPlay,
  onDelete,
}: {
  takes: TakeRecord[];
  onPlay: (take: TakeRecord) => void;
  onDelete: (take: TakeRecord) => void;
}) {
  if (takes.length === 0) {
    return <Text style={styles.empty}>No takes yet.</Text>;
  }
  return (
    <View style={styles.container}>
      {takes.map((take) => (
        <View key={take.id} style={styles.row}>
          <Text style={styles.meta}>
            {formatTakeDate(take.createdAt)} · {formatDuration(take.durationMs)}
          </Text>
          <View style={styles.actions}>
            <Pressable onPress={() => onPlay(take)}>
              <Text style={styles.action}>Play</Text>
            </Pressable>
            <Pressable onPress={() => onDelete(take)}>
              <Text style={styles.actionDanger}>Delete</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#ddd" },
  meta: { fontSize: 15 },
  actions: { flexDirection: "row", gap: 16 },
  action: { color: "#2b6cb0", fontWeight: "600" },
  actionDanger: { color: "#b00020", fontWeight: "600" },
  empty: { opacity: 0.6, padding: 16, textAlign: "center" },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/takes-view.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/ui/takes-view.tsx tests/ui/takes-view.test.tsx
git commit -m "feat(app): TakesView (list + play/delete)"
```

---

### Task 5: `ExpoMicRecorder` — `AudioStream` capture (spike + implementation)

The exact `AudioStream` creation API and PCM payload shape are the unknowns. This
is a **spike-first** task: confirm them, then implement. No unit test (device-only).

**Files:**
- Create: `src/audio/expo-mic-recorder.ts`
- Modify: `package.json`, `app.json` (expo-audio plugin)

**Interfaces:**
- Consumes: `MicRecorder`, `FrameListener`, `Take` (Task 2).
- Produces: a factory that yields a `MicRecorder`. If `expo-audio` only exposes the
  **hook** `useAudioStream()`, expose `useExpoMicRecorder(): MicRecorder` instead of a
  class — either way the `MicRecorder` interface is honored.

- [ ] **Step 1: Install + configure**

```bash
npx expo install expo-audio
```
Then add to `app.json` `expo.plugins`:
```json
["expo-audio", { "microphonePermission": "Allow HumMyna to use the microphone to record your voice." }]
```

- [ ] **Step 2: Spike — confirm the capture API + PCM shape**

Inspect the installed `expo-audio` typings (`node_modules/expo-audio/build/*.d.ts`)
and **record in the report**:
  - whether `AudioStream` has a non-hook creator (`createAudioStream`?) or only the
    `useAudioStream()` hook;
  - the PCM event payload (event name + whether samples are `Float32Array` or
    `Int16Array`, channel layout, `sampleRate`, `channels`);
  - `startFileRecordingAsync(options)` options for a Documents-dir WAV and the
    `stopFileRecordingAsync()`/`stop()` result shape (`uri`, duration).
  If only a hook exists, implement `useExpoMicRecorder()` (a `MicRecorder` object
  recreated per component) rather than a class.

- [ ] **Step 3: Implement `src/audio/expo-mic-recorder.ts`** (shape; adjust to the confirmed API)

```ts
import { AudioModule, setAudioModeAsync, useAudioStream } from "expo-audio";
import { useMemo } from "react";
import type { FrameListener, MicRecorder, Take } from "./mic-recorder";

// toFloat32: convert the stream's raw PCM payload to Float32Array if it is Int16.
function toFloat32(payload: unknown): Float32Array {
  if (payload instanceof Float32Array) return payload;
  if (payload instanceof Int16Array) {
    const out = new Float32Array(payload.length);
    for (let i = 0; i < payload.length; i++) out[i] = payload[i] / 32768;
    return out;
  }
  return new Float32Array(0);
}

/** Hook-based MicRecorder over expo-audio's AudioStream (mic monitoring stays off). */
export function useExpoMicRecorder(): MicRecorder {
  const stream = useAudioStream(); // spike: real options/type
  const sampleRate = stream?.sampleRate ?? 44100;

  return useMemo<MicRecorder>(() => {
    const listeners = new Set<FrameListener>();
    let startedAt = 0;
    return {
      async prepare() {
        const permission = await AudioModule.requestRecordingPermissionsAsync();
        if (!permission.granted) throw new Error("HumMyna: microphone permission denied");
        // Monitoring off: no input routed to output.
        await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      },
      start() {
        if (!stream || stream.isStreaming) return;
        startedAt = Date.now();
        // spike: subscribe to the stream's PCM event -> for (const l of listeners) l(toFloat32(payload), sampleRate)
        void stream.startFileRecordingAsync({ directory: "document" });
        void stream.start();
      },
      frames(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      async stop(): Promise<Take> {
        const result = await stream.stopFileRecordingAsync().catch(() => null);
        stream.stop();
        return {
          uri: result?.uri ?? "",
          durationMs: Date.now() - startedAt,
          sampleRate,
        };
      },
      dispose() {
        listeners.clear();
        stream?.stop();
      },
    };
  }, [stream, sampleRate]);
}
```

- [ ] **Step 4: Gate**

Run: `npm run lint` then `npm test`
Expected: PASS (expo-audio imports resolve; no unit test for this task).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app.json src/audio/expo-mic-recorder.ts
git commit -m "feat(app): expo-audio AudioStream MicRecorder (voice capture + WAV)"
```

---

### Task 6: Song load helper + record route + Record entry

**Files:**
- Create: `src/audio/load-song.ts`, `src/app/record/[id].tsx`
- Modify: `src/ui/player-view.tsx`, `src/app/player/[id].tsx`, `docs/DEVICE-VERIFICATION.md`
- Test: `tests/ui/player-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `loadSong`, `openLibraryDb`/`openTakesStore` (Task 1), `useRecorder` (Task 2), `useExpoMicRecorder` (Task 5), `RecordView` (Task 3), `WebViewSynthEngine`/`loadSynthSources`/`soundFontBytes` (P2.2).
- Produces: `loadSong(libraryId, number): Promise<{ library, ref, midi } | null>`; `PlayerView` gains `onRecord?`.

- [ ] **Step 1: Extend the PlayerView test (red)**

Add to `tests/ui/player-view.test.tsx` (new `it`):

```tsx
it("triggers recording from the Record button", async () => {
  const onRecord = jest.fn();
  await render(
    <PlayerView title="G1" singer="S1" lines={lines} controller={stubController()} onRecord={onRecord} />,
  );
  fireEvent.press(screen.getByText("Record"));
  expect(onRecord).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/player-view.test.tsx -t "Record button"`
Expected: FAIL — no "Record" text.

- [ ] **Step 3: Add `onRecord` to `PlayerView` (`src/ui/player-view.tsx`)**

Add the prop and, after the transport row, a secondary row:

```tsx
        <Pressable onPress={() => onRecord?.()}>
          <Text style={styles.button}>Record</Text>
        </Pressable>
```
Add `onRecord?: () => void` to the props type.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/ui/player-view.test.tsx`
Expected: PASS (all PlayerView tests).

- [ ] **Step 5: Create `src/audio/load-song.ts`**

```ts
import type { SongRef } from "@hummyna/hmp";
import { openHmp } from "@hummyna/hmp";
import { openLibraryDb } from "../library/db";
import type { Library } from "../library/store";
import { libraryKeys } from "../library/keys";
import { fileByteSource } from "../platform/file-byte-source";
import { rnCryptoAdapter } from "../platform/rn-crypto";
import { rnInflateAdapter } from "../platform/rn-inflate";

export interface LoadedSong {
  library: Library;
  ref: SongRef;
  midi: Uint8Array;
}

/** Opens a song's MIDI, closing the ByteSource as soon as the bytes are read. */
export async function loadSong(libraryId: number, number: number): Promise<LoadedSong | null> {
  const store = await openLibraryDb();
  const library = await store.getLibrary(libraryId);
  if (!library) return null;
  const source = await fileByteSource(library.path);
  try {
    const hmp = await openHmp(source, libraryKeys(), {
      crypto: rnCryptoAdapter,
      inflate: rnInflateAdapter,
    });
    const ref = hmp.songs().find((s) => s.number === number);
    if (!ref) return null;
    return { library, ref, midi: await hmp.midiFor(ref) };
  } finally {
    source.close();
  }
}
```

- [ ] **Step 6: Implement `src/app/record/[id].tsx`**

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { useExpoMicRecorder } from "../../audio/expo-mic-recorder";
import { loadSong } from "../../audio/load-song";
import { soundFontBytes } from "../../audio/sf2";
import { loadSynthSources } from "../../audio/synth-assets";
import { useRecorder } from "../../audio/use-recorder";
import { WebViewSynthEngine } from "../../audio/webview-synth-engine";
import { openTakesStore } from "../../library/db";
import { RecordView } from "../../ui/record-view";

export default function RecordScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const router = useRouter();
  const libraryId = Number(id);
  const songNumber = Number(number);
  const recorder = useExpoMicRecorder();
  const controller = useRecorder(recorder);
  const [backing, setBacking] = useState<WebViewSynthEngine | null>(null);
  const [message, setMessage] = useState("Loading...");
  const [title, setTitle] = useState("");
  const [singer, setSinger] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const loaded = await loadSong(libraryId, songNumber).catch(() => null);
      if (!active) return;
      if (!loaded) {
        setMessage("Couldn't open this song.");
        return;
      }
      let sf2: Uint8Array;
      try {
        sf2 = await soundFontBytes();
      } catch (err) {
        if (active) setMessage(err instanceof Error ? err.message : "No SoundFont configured.");
        return;
      }
      const { libraryJs, processorJs } = await loadSynthSources();
      const engine = new WebViewSynthEngine({ libraryJs, processorJs, sf2 });
      await engine.load(loaded.midi).catch(() => {});
      if (!active) return;
      setTitle(loaded.ref.title);
      setSinger(loaded.ref.singer);
      setBacking(engine);
    })();
    return () => {
      active = false;
    };
  }, [libraryId, songNumber]);

  const onStart = () => {
    void controller.start();
    backing?.play();
  };

  const onStop = async () => {
    backing?.stop();
    const take = await controller.stop();
    if (!take || !take.uri) return;
    const takes = await openTakesStore();
    await takes.addTake({ libraryId, number: songNumber, path: take.uri, durationMs: take.durationMs });
    router.replace({ pathname: "/takes/[id]", params: { id, number } });
  };

  useEffect(() => () => backing?.dispose(), [backing]);

  if (!backing && message !== "Loading...") {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>{message}</Text>
      </View>
    );
  }
  return (
    <RecordView
      title={title}
      singer={singer}
      status={controller.status}
      elapsedSec={controller.elapsedSec}
      level={controller.level}
      error={controller.error}
      onStart={onStart}
      onStop={() => void onStop()}
    />
  );
}
```

> The backing synth is a headless WebView in P2.2; it plays without a visible host because `WebViewSynthEngine` posts over its bridge. Render `SynthHost` here if the spike finds the WebView must be mounted — follow whatever Task 5's engine requires.

- [ ] **Step 7: Wire the player's Record button (`src/app/player/[id].tsx`)**

Pass `onRecord` to `PlayerView`:
```tsx
<PlayerView
  title={title}
  singer={singer}
  lines={lines}
  controller={controller}
  onRecord={() => router.push({ pathname: "/record/[id]", params: { id, number } })}
/>
```
(Import `useRouter` if not already.)

- [ ] **Step 8: Append to `docs/DEVICE-VERIFICATION.md`**

A "P2.3 — Recording" section: grant mic permission; from a song tap **Record** → backing plays + voice records; stop → a take is saved; the meter moves; error path when permission is denied; record-while-playing works (note the iOS session caveat).

- [ ] **Step 9: Gate**

Run: `npm run lint` then `npm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add "src/audio/load-song.ts" "src/app/record/[id].tsx" src/app/player/[id].tsx src/ui/player-view.tsx tests/ui/player-view.test.tsx docs/DEVICE-VERIFICATION.md
git commit -m "feat(app): sing-along record route + Record entry"
```

---

### Task 7: Takes screen (list + play + delete)

**Files:**
- Create: `src/app/takes/[id].tsx`
- Modify: `src/ui/player-view.tsx`, `src/app/player/[id].tsx`
- Test: `tests/ui/player-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `openTakesStore`, `TakeRecord` (Task 1), `TakesView`/`formatDuration` (Task 4), `expo-audio` `useAudioPlayer`.
- Produces: `PlayerView` gains `onTakes?`; the `/takes/[id]` route.

- [ ] **Step 1: Extend the PlayerView test (red)**

```tsx
it("triggers the takes list", async () => {
  const onTakes = jest.fn();
  await render(
    <PlayerView title="G1" singer="S1" lines={lines} controller={stubController()} onTakes={onTakes} />,
  );
  fireEvent.press(screen.getByText("Takes"));
  expect(onTakes).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/ui/player-view.test.tsx -t "takes list"`
Expected: FAIL — no "Takes" text.

- [ ] **Step 3: Add `onTakes` to `PlayerView`** (prop + a `Pressable` "Takes" button beside Record), then run `npx jest tests/ui/player-view.test.tsx` → PASS.

- [ ] **Step 4: Implement `src/app/takes/[id].tsx`**

```tsx
import { useAudioPlayer } from "expo-audio";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Text } from "react-native";
import { File } from "expo-file-system";
import type { TakeRecord } from "../../library/takes";
import { openTakesStore } from "../../library/db";
import { TakesView } from "../../ui/takes-view";

export default function TakesScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const libraryId = Number(id);
  const songNumber = Number(number);
  const [takes, setTakes] = useState<TakeRecord[]>([]);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const player = useAudioPlayer(playingUri);

  const refresh = useCallback(async () => {
    const store = await openTakesStore();
    setTakes(await store.listTakes(libraryId, songNumber));
  }, [libraryId, songNumber]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onPlay = (take: TakeRecord) => {
    setPlayingUri(take.path);
    player.seekTo(0);
    player.play();
  };

  const onDelete = async (take: TakeRecord) => {
    const store = await openTakesStore();
    await store.deleteTake(take.id);
    try {
      const file = new File(take.path);
      if (file.exists) file.delete();
    } catch {
      // best effort — the row is already gone
    }
    await refresh();
  };

  if (takes.length === 0) return <Text style={{ padding: 16 }}>No takes yet.</Text>;
  return <TakesView takes={takes} onPlay={onPlay} onDelete={(t) => void onDelete(t)} />;
}
```

> `useAudioPlayer(playingUri)` re-creates the player when `playingUri` changes; confirm the SDK 58 result shape during the spike and adjust if it takes a source object.

- [ ] **Step 5: Wire the player's Takes button (`src/app/player/[id].tsx`)**

```tsx
onTakes={() => router.push({ pathname: "/takes/[id]", params: { id, number } })}
```

- [ ] **Step 6: Gate + commit**

Run: `npm run lint` then `npm test` → PASS.

```bash
git add "src/app/takes/[id].tsx" src/ui/player-view.tsx src/app/player/[id].tsx tests/ui/player-view.test.tsx
git commit -m "feat(app): takes screen (play voice + delete)"
```

---

## Self-Review

**Spec coverage:** §4 `MicRecorder` -> Task 2 (interface), Task 5 (impl); §3 `AudioStream` -> Task 5; §5 record flow -> Task 6; §6 takes store -> Task 1; §7 UI -> Tasks 3/4/6/7; §8 errors -> Tasks 2/3/5/6; §9 testing -> Tasks 1-4 (unit), 5-7 (device); §10 deps -> Task 5; §11 risks -> Tasks 5/6 spikes; monitoring-off + voice-only -> Tasks 5/7.

**Placeholder scan:** the only intentional unknowns are the `expo-audio AudioStream` creation API + PCM payload (Task 5) and the `useAudioPlayer` source shape (Task 7), handled by explicit spike/confirm steps whose outputs are recorded — the same pattern used in P2.1/P2.2. No "TBD"/"handle edge cases" stubs.

**Type consistency:** `Take`/`MicRecorder` (Task 2) used Tasks 3/5/6; `TakeRecord`/`TakesStore` (Task 1) used Tasks 4/7; `RecorderStatus`/`useRecorder` (Task 2) used Tasks 3/6; `RecordView` (Task 3) used Task 6; `TakesView` (Task 4) used Task 7; `loadSong` (Task 6) used Task 6; `PlayerView.onRecord`/`onTakes` added in Tasks 6/7 respectively.

```
```
