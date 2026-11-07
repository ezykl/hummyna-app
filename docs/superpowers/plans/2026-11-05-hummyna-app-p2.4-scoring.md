# HumMyna App — P2.4 Scoring (Pitch vs Reference) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a sing-along take, score the captured voice against the song's reference melody (note/line/total %, grade, best streak), with an explicit labeled random "fun mode".

**Architecture:** `packages/hmp` gains a MIDI note parser + melody extractor (vitest-tested). The app accumulates the P2.3 PCM frames, detects pitch with `pitchy`, scores deterministically (pure, unit-tested), and shows a results screen. Recording → score → results is the only native/navigation path.

**Tech Stack:** Expo SDK 58 · TypeScript · `pitchy` (0BSD) · vitest (reader) + jest-expo (app).

**Spec:** `docs/superpowers/specs/2026-11-05-hummyna-app-p2.4-scoring-design.md`

## Global Constraints

- **No new runtime deps in `packages/hmp`** — the note parser is code, not a dependency.
- Scoring is **pure and deterministic** (same inputs → same output; no clock/randomness) except the explicit `randomScore`.
- Detection/scoring modules live in the app (`src/score/`); `packages/hmp` owns MIDI parsing.
- Functions must never divide by zero (empty reference/detected → defined results, not NaN).
- Gate every task: `npm run lint` + the relevant test command green. Commits with explicit paths. `main` is the default branch.

---

### Task 1: MIDI note parser + melody extractor (`packages/hmp`)

**Files:**
- Modify: `packages/hmp/src/midi.ts` (export the shared low-level readers)
- Create: `packages/hmp/src/notes.ts`
- Modify: `packages/hmp/src/index.ts`
- Test: `packages/hmp/tests/notes.test.ts`

**Interfaces:**
- Produces: `NoteEvent { startMs; endMs; midi; velocity; track }`, `parseNotes(midi): NoteEvent[]`, `ReferenceNote { startMs; endMs; midi }`, `extractMelody(midi): ReferenceNote[]` (all exported from `@hummyna/hmp`).

- [ ] **Step 1: Export the low-level readers from `midi.ts`**

In `packages/hmp/src/midi.ts`, add `export` to the four existing helpers so `notes.ts` can reuse them (no behavior change): `readU32`, `readU16`, `matches`, `readVlq`.

- [ ] **Step 2: Write the failing test** (`packages/hmp/tests/notes.test.ts`)

```ts
import { describe, expect, it } from "vitest";
import { extractMelody, parseNotes } from "../src/notes";
import { midiFromEvents } from "./fixtures/midi";

// Header division = 96; default tempo 500000 us/quarter -> 96 ticks = 500 ms.
const twoNotes = () =>
  midiFromEvents([
    0x00, 0x90, 0x45, 0x60, // note on 69, vel 96, at tick 0
    0x60, 0x80, 0x45, 0x40, // +96 ticks: note off 69 (tick 96 -> 500 ms)
    0x00, 0x90, 0x48, 0x60, // note on 72 at tick 96
    0x60, 0x80, 0x48, 0x40, // +96: note off 72 (tick 192 -> 1000 ms)
    0x00, 0xff, 0x2f, 0x00,
  ]);

describe("parseNotes", () => {
  it("returns note events with tick->ms timing", () => {
    const notes = parseNotes(twoNotes());
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ midi: 69, startMs: 0, endMs: 500, track: 0 });
    expect(notes[1]).toMatchObject({ midi: 72, startMs: 500, endMs: 1000 });
  });

  it("returns [] for non-midi", () => {
    expect(parseNotes(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("extractMelody", () => {
  it("returns a sorted monophonic reference", () => {
    const ref = extractMelody(twoNotes());
    expect(ref.map((r) => r.midi)).toEqual([69, 72]);
    expect(ref[0].startMs).toBeLessThanOrEqual(ref[1].startMs);
  });

  it("returns [] when there are no notes", () => {
    expect(extractMelody(midiFromEvents([0x00, 0xff, 0x2f, 0x00]))).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (workdir `packages/hmp`): `npx vitest run tests/notes.test.ts`
Expected: FAIL — cannot find module `../src/notes`.

- [ ] **Step 4: Implement `packages/hmp/src/notes.ts`**

```ts
import { matches, readU16, readU32, readVlq } from "./midi";

const MTHD = [0x4d, 0x54, 0x68, 0x64];
const MTRK = [0x4d, 0x54, 0x72, 0x6b];

export interface NoteEvent {
  startMs: number;
  endMs: number;
  midi: number;
  velocity: number;
  track: number;
}

export interface ReferenceNote {
  startMs: number;
  endMs: number;
  midi: number;
}

interface TickEvent {
  tick: number;
  kind: "tempo" | "lyric" | "noteon" | "noteoff";
  a?: number;
  b?: number;
}

interface Tempo {
  tick: number;
  usPerQuarter: number;
}

function scanTrack(midi: Uint8Array, from: number, to: number, onEvent: (e: TickEvent) => void): void {
  let pos = from;
  let running = -1;
  let tick = 0;
  while (pos < to) {
    const delta = readVlq(midi, pos, to);
    if (!delta) break;
    pos = delta.pos;
    tick += delta.value;
    if (pos >= to) break;
    let status: number;
    if (midi[pos] & 0x80) {
      status = midi[pos++];
      if (status >= 0xf0) running = -1;
      else running = status;
    } else {
      status = running;
      if (status < 0) break;
    }
    if (status === 0xff) {
      if (pos >= to) break;
      const meta = midi[pos++];
      const len = readVlq(midi, pos, to);
      if (!len) break;
      pos = len.pos;
      if (pos + len.value > to) break;
      if (meta === 0x51 && len.value === 3) {
        onEvent({ tick, kind: "tempo", a: (midi[pos] << 16) | (midi[pos + 1] << 8) | midi[pos + 2] });
      } else if (meta === 0x05) {
        onEvent({ tick, kind: "lyric" });
      } else if (meta === 0x2f) {
        break;
      }
      pos += len.value;
    } else if (status === 0xf0 || status === 0xf7) {
      const len = readVlq(midi, pos, to);
      if (!len || len.pos + len.value > to) break;
      pos = len.pos + len.value;
    } else {
      const hi = status >> 4;
      const dataLen = hi === 0xc || hi === 0xd ? 1 : 2;
      if (pos + dataLen > to) break;
      if (hi === 0x9) onEvent({ tick, kind: midi[pos + 1] > 0 ? "noteon" : "noteoff", a: midi[pos], b: midi[pos + 1] });
      else if (hi === 0x8) onEvent({ tick, kind: "noteoff", a: midi[pos], b: midi[pos + 1] });
      pos += dataLen;
    }
  }
}

function eachTrack(midi: Uint8Array, fn: (from: number, to: number, index: number) => void): void {
  const headerLen = readU32(midi, 4);
  let pos = 8 + headerLen;
  let index = 0;
  while (pos + 8 <= midi.length && matches(midi, pos, MTRK)) {
    const len = readU32(midi, pos + 4);
    const from = pos + 8;
    const to = Math.min(from + len, midi.length);
    fn(from, to, index);
    if (from + len > midi.length) break;
    pos = from + len;
    index += 1;
  }
}

function buildTempos(midi: Uint8Array): Tempo[] {
  const tempos: Tempo[] = [{ tick: 0, usPerQuarter: 500000 }];
  eachTrack(midi, (from, to) => {
    scanTrack(midi, from, to, (e) => {
      if (e.kind === "tempo") tempos.push({ tick: e.tick, usPerQuarter: e.a as number });
    });
  });
  tempos.sort((a, b) => a.tick - b.tick);
  return tempos;
}

function tickToMs(tick: number, tempos: Tempo[], division: number): number {
  let ms = 0;
  let lastTick = 0;
  let us = 500000;
  for (const t of tempos) {
    if (t.tick >= tick) break;
    ms += ((t.tick - lastTick) * us) / division / 1000;
    lastTick = t.tick;
    us = t.usPerQuarter;
  }
  return ms + ((tick - lastTick) * us) / division / 1000;
}

function lyricTrackIndex(midi: Uint8Array): number {
  let found = -1;
  eachTrack(midi, (from, to, index) => {
    if (found >= 0) return;
    scanTrack(midi, from, to, (e) => {
      if (e.kind === "lyric") found = index;
    });
  });
  return found;
}

function monophonise(notes: NoteEvent[]): ReferenceNote[] {
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs || b.midi - a.midi);
  const out: ReferenceNote[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && n.startMs < prev.endMs) {
      if (n.midi > prev.midi) {
        prev.endMs = Math.max(prev.startMs, n.startMs);
        out.push({ startMs: n.startMs, endMs: n.endMs, midi: n.midi });
      }
      // lower or equal overlapping pitch: ignored (keep the higher melody note)
    } else {
      out.push({ startMs: n.startMs, endMs: n.endMs, midi: n.midi });
    }
  }
  return out.filter((r) => r.endMs > r.startMs);
}

/** Note-on/off events across all tracks, tick->ms via the tempo map. */
export function parseNotes(midi: Uint8Array): NoteEvent[] {
  if (midi.length < 14 || !matches(midi, 0, MTHD)) return [];
  const headerLen = readU32(midi, 4);
  if (headerLen < 6) return [];
  const division = readU16(midi, 12) || 96;
  const tempos = buildTempos(midi);

  const raw: { track: number; tickOn: number; tickOff: number; midi: number; velocity: number }[] = [];
  eachTrack(midi, (from, to, track) => {
    const active = new Map<number, { tick: number; velocity: number }>();
    scanTrack(midi, from, to, (e) => {
      if (e.kind === "noteon") {
        active.set(e.a as number, { tick: e.tick, velocity: e.b as number });
      } else if (e.kind === "noteoff") {
        const key = e.a as number;
        const on = active.get(key);
        if (on) {
          active.delete(key);
          raw.push({ track, tickOn: on.tick, tickOff: e.tick, midi: key, velocity: on.velocity });
        }
      }
    });
  });

  return raw
    .map((n) => ({
      track: n.track,
      midi: n.midi,
      velocity: n.velocity,
      startMs: tickToMs(n.tickOn, tempos, division),
      endMs: tickToMs(n.tickOff, tempos, division),
    }))
    .filter((n) => n.endMs > n.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
}

/** The song's singable melody as a monophonic time->pitch track. */
export function extractMelody(midi: Uint8Array): ReferenceNote[] {
  const notes = parseNotes(midi);
  if (notes.length === 0) return [];
  const lyric = lyricTrackIndex(midi);
  const chosen = lyric >= 0 && notes.some((n) => n.track === lyric) ? notes.filter((n) => n.track === lyric) : notes;
  return monophonise(chosen.length > 0 ? chosen : notes);
}
```

- [ ] **Step 5: Export from the package — add to `packages/hmp/src/index.ts`**

```ts
export * from "./notes";
```

- [ ] **Step 6: Run the tests to verify they pass**

Run (workdir `packages/hmp`): `npx vitest run tests/notes.test.ts`
Then run the whole workspace: `npm run lint` (root) and `npm test -w @hummyna/hmp`.
Expected: PASS (4 new tests) + existing 31 still green + tsc clean.

- [ ] **Step 7: Commit**

```bash
git add packages/hmp/src/midi.ts packages/hmp/src/notes.ts packages/hmp/src/index.ts packages/hmp/tests/notes.test.ts
git commit -m "feat(hmp): MIDI note parser + melody extractor"
```

---

### Task 2: `FrameCollector`

**Files:**
- Create: `src/score/frames.ts`
- Test: `tests/score/frames.test.ts`

**Interfaces:**
- Produces: `FrameCollector` (`push(pcm)`, `sampleRate`, `durationMs`, `frames()`).

- [ ] **Step 1: Write the failing test**

```ts
import { FrameCollector } from "../../src/score/frames";

describe("FrameCollector", () => {
  it("concatenates pushed frames and tracks duration", () => {
    const c = new FrameCollector(1000); // 1000 Hz for easy math
    c.push(new Float32Array([1, 2]));
    c.push(new Float32Array([3, 4, 5]));
    expect(Array.from(c.frames())).toEqual([1, 2, 3, 4, 5]);
    expect(c.durationMs).toBe(5); // 5 samples / 1000 Hz = 5 ms
    expect(c.sampleRate).toBe(1000);
  });

  it("is empty before any push", () => {
    const c = new FrameCollector(44100);
    expect(c.frames().length).toBe(0);
    expect(c.durationMs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/score/frames.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement `src/score/frames.ts`**

```ts
/** Accumulates PCM frames captured during a take into one buffer. */
export class FrameCollector {
  private readonly chunks: Float32Array[] = [];
  private length = 0;

  constructor(readonly sampleRate: number) {}

  push(pcm: Float32Array): void {
    this.chunks.push(pcm);
    this.length += pcm.length;
  }

  get durationMs(): number {
    return (this.length / this.sampleRate) * 1000;
  }

  frames(): Float32Array {
    const out = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS; commit

```bash
git add src/score/frames.ts tests/score/frames.test.ts
git commit -m "feat(app): FrameCollector for take PCM"
```

---

### Task 3: `detectFrames` (pitchy)

**Files:**
- Create: `src/score/pitch.ts`
- Modify: `package.json`
- Test: `tests/score/pitch.test.ts`

**Interfaces:**
- Produces: `DetectedFrame { timeMs; midi; cents; clarity }`, `detectFrames(pcm, sampleRate, opts?)`.

- [ ] **Step 1: Install** `npm install pitchy`

- [ ] **Step 2: Write the failing test**

```ts
import { detectFrames } from "../../src/score/pitch";

function sine(freq: number, sampleRate: number, ms: number): Float32Array {
  const n = Math.round((sampleRate * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe("detectFrames", () => {
  it("detects A440 as MIDI 69", () => {
    const frames = detectFrames(sine(440, 44100, 400), 44100);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.midi === 69)).toBe(true);
    expect(Math.abs(frames[0].cents)).toBeLessThan(10);
  });

  it("detects A220 as MIDI 57", () => {
    const frames = detectFrames(sine(220, 44100, 400), 44100);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.midi === 57)).toBe(true);
  });

  it("returns no frames for silence", () => {
    expect(detectFrames(new Float32Array(44100), 44100)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails** → FAIL.

- [ ] **Step 4: Implement `src/score/pitch.ts`**

```ts
import { PitchDetector } from "pitchy";

export interface DetectedFrame {
  timeMs: number;
  midi: number;
  cents: number;
  clarity: number;
}

export function detectFrames(
  pcm: Float32Array,
  sampleRate: number,
  opts: { hopMs?: number; windowMs?: number; minClarity?: number } = {},
): DetectedFrame[] {
  const hopMs = opts.hopMs ?? 40;
  const windowMs = opts.windowMs ?? 50;
  const minClarity = opts.minClarity ?? 0.9;
  const windowSize = Math.max(2, Math.round((windowMs / 1000) * sampleRate));
  const hopSize = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  if (pcm.length < windowSize) return [];

  const detector = PitchDetector.forFloat32Array(windowSize);
  const out: DetectedFrame[] = [];
  for (let start = 0; start + windowSize <= pcm.length; start += hopSize) {
    const slice = pcm.subarray(start, start + windowSize);
    let frequency = 0;
    let clarity = 0;
    try {
      [frequency, clarity] = detector.findPitch(slice, sampleRate);
    } catch {
      continue;
    }
    if (!(frequency > 0) || clarity < minClarity) continue;
    const midiFloat = 69 + 12 * Math.log2(frequency / 440);
    const midi = Math.round(midiFloat);
    out.push({
      timeMs: ((start + windowSize / 2) / sampleRate) * 1000,
      midi,
      cents: (midiFloat - midi) * 100,
      clarity,
    });
  }
  return out;
}
```

- [ ] **Step 5: Run test to verify it passes** → PASS; commit

```bash
git add package.json package-lock.json src/score/pitch.ts tests/score/pitch.test.ts
git commit -m "feat(app): pitch detection via pitchy"
```

---

### Task 4: `scorePerformance` + line grouping

**Files:**
- Create: `src/score/score.ts`
- Test: `tests/score/score.test.ts`

**Interfaces:**
- Consumes: `ReferenceNote` (`@hummyna/hmp`), `DetectedFrame` (Task 3).
- Produces: `NoteScore`, `LineScore`, `ScoreResult`, `scorePerformance(reference, detected, opts?)`.

- [ ] **Step 1: Write the failing test**

```ts
import type { LyricLine, ReferenceNote } from "@hummyna/hmp";
import type { DetectedFrame } from "../../src/score/pitch";
import { scorePerformance } from "../../src/score/score";

const note = (startMs: number, endMs: number, midi: number): ReferenceNote => ({ startMs, endMs, midi });
const frame = (timeMs: number, midi: number, cents = 0): DetectedFrame => ({ timeMs, midi, cents, clarity: 1 });

describe("scorePerformance", () => {
  it("scores an all-hit take as S / 1.0", () => {
    const r = scorePerformance([note(0, 500, 69)], [frame(250, 69, 5)]);
    expect(r.noteCount).toBe(1);
    expect(r.hitCount).toBe(1);
    expect(r.accuracy).toBe(1);
    expect(r.grade).toBe("S");
    expect(r.bestStreak).toBe(1);
  });

  it("scores half and computes the longest streak", () => {
    const ref = [note(0, 500, 60), note(500, 1000, 62), note(1000, 1500, 64)];
    const det = [frame(250, 60), frame(750, 62)]; // third note missed
    const r = scorePerformance(ref, det);
    expect(r.hitCount).toBe(2);
    expect(r.accuracy).toBeCloseTo(2 / 3, 5);
    expect(r.bestStreak).toBe(2);
    expect(r.grade).toBe("B");
  });

  it("treats out-of-tolerance pitch as a miss", () => {
    const r = scorePerformance([note(0, 500, 69)], [frame(250, 71)]);
    expect(r.hitCount).toBe(0);
    expect(r.grade).toBe("D");
  });

  it("shifts hits by the calibration offset", () => {
    const ref = [note(1000, 1500, 60)];
    const det = [frame(1700, 60)];
    expect(scorePerformance(ref, det).hitCount).toBe(0);
    expect(scorePerformance(ref, det, { offsetMs: 100 }).hitCount).toBe(1);
  });

  it("groups notes into lyric lines", () => {
    const ref = [note(0, 400, 60), note(500, 900, 62)];
    const det = [frame(200, 60), frame(700, 62)];
    const lines: LyricLine[] = [
      { timeMs: 0, text: "a" },
      { timeMs: 500, text: "b" },
    ];
    const r = scorePerformance(ref, det, { lines });
    expect(r.lines.map((l) => l.accuracy)).toEqual([1, 1]);
  });

  it("never divides by zero", () => {
    expect(scorePerformance([], []).accuracy).toBe(0);
    expect(scorePerformance([], []).lines).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/score/score.ts`**

```ts
import type { LyricLine, ReferenceNote } from "@hummyna/hmp";
import type { DetectedFrame } from "./pitch";

export interface NoteScore {
  note: ReferenceNote;
  hit: boolean;
  cents: number;
}

export interface LineScore {
  startMs: number;
  endMs: number;
  total: number;
  hit: number;
  accuracy: number;
}

export interface ScoreResult {
  noteCount: number;
  hitCount: number;
  accuracy: number;
  bestStreak: number;
  grade: string;
  notes: NoteScore[];
  lines: LineScore[];
}

export interface ScoreOptions {
  offsetMs?: number;
  centTolerance?: number;
  timingToleranceMs?: number;
  lines?: LyricLine[];
}

function gradeFor(accuracy: number): string {
  if (accuracy >= 0.9) return "S";
  if (accuracy >= 0.8) return "A";
  if (accuracy >= 0.65) return "B";
  if (accuracy >= 0.5) return "C";
  return "D";
}

function groupLines(notes: NoteScore[], lines: LyricLine[]): LineScore[] {
  return lines.map((line, index) => {
    const endMs = index + 1 < lines.length ? lines[index + 1].timeMs : Number.POSITIVE_INFINITY;
    const inLine = notes.filter((n) => n.note.startMs >= line.timeMs && n.note.startMs < endMs);
    const hit = inLine.filter((n) => n.hit).length;
    const total = inLine.length;
    return {
      startMs: line.timeMs,
      endMs: Number.isFinite(endMs) ? endMs : total > 0 ? inLine[total - 1].note.endMs : line.timeMs,
      total,
      hit,
      accuracy: total > 0 ? hit / total : 0,
    };
  });
}

export function scorePerformance(
  reference: ReferenceNote[],
  detected: DetectedFrame[],
  opts: ScoreOptions = {},
): ScoreResult {
  const offsetMs = opts.offsetMs ?? 0;
  const centTolerance = opts.centTolerance ?? 50;
  const timingToleranceMs = opts.timingToleranceMs ?? 150;

  const notes: NoteScore[] = reference.map((note) => {
    const from = note.startMs - timingToleranceMs + offsetMs;
    const to = note.endMs + timingToleranceMs + offsetMs;
    let best: DetectedFrame | null = null;
    for (const f of detected) {
      if (f.timeMs < from || f.timeMs > to) continue;
      if (f.midi !== note.midi) continue;
      if (Math.abs(f.cents) > centTolerance) continue;
      if (!best || f.clarity > best.clarity) best = f;
    }
    return { note, hit: best !== null, cents: best ? best.cents : 0 };
  });

  const hitCount = notes.filter((n) => n.hit).length;
  const noteCount = notes.length;
  const accuracy = noteCount > 0 ? hitCount / noteCount : 0;

  let bestStreak = 0;
  let streak = 0;
  for (const n of notes) {
    streak = n.hit ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }

  return {
    noteCount,
    hitCount,
    accuracy,
    bestStreak,
    grade: gradeFor(accuracy),
    notes,
    lines: groupLines(notes, opts.lines ?? []),
  };
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS; commit

```bash
git add src/score/score.ts tests/score/score.test.ts
git commit -m "feat(app): deterministic performance scoring"
```

---

### Task 5: Fun mode + results handoff store

**Files:**
- Create: `src/score/fun.ts`, `src/score/results-store.ts`
- Test: `tests/score/fun.test.ts`, `tests/score/results-store.test.ts`

**Interfaces:**
- Produces: `randomScore(noteCount, seed): ScoreResult`; `setLastResult(result, { funMode? })`, `getLastResult(): { result; funMode } | null`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/score/fun.test.ts
import { randomScore } from "../../src/score/fun";

describe("randomScore", () => {
  it("is deterministic per seed and stays in range", () => {
    const a = randomScore(12, 42);
    const b = randomScore(12, 42);
    expect(a.accuracy).toBe(b.accuracy);
    expect(a.grade).toBe(b.grade);
    expect(a.noteCount).toBe(12);
    expect(a.accuracy).toBeGreaterThanOrEqual(0);
    expect(a.accuracy).toBeLessThanOrEqual(1);
    expect(["S", "A", "B", "C", "D"]).toContain(a.grade);
  });
});
```

```ts
// tests/score/results-store.test.ts
import { getLastResult, setLastResult } from "../../src/score/results-store";
import { scorePerformance } from "../../src/score/score";

describe("results store", () => {
  it("stores the last result with its flags", () => {
    const result = scorePerformance([], []);
    setLastResult(result, { funMode: true });
    expect(getLastResult()).toEqual({ result, funMode: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail** → `npx jest tests/score/fun.test.ts tests/score/results-store.test.ts` FAIL.

- [ ] **Step 3: Implement `src/score/fun.ts`**

```ts
import type { NoteScore, ScoreResult } from "./score";

function gradeFor(accuracy: number): string {
  if (accuracy >= 0.9) return "S";
  if (accuracy >= 0.8) return "A";
  if (accuracy >= 0.65) return "B";
  if (accuracy >= 0.5) return "C";
  return "D";
}

/** Deterministic random result for the opt-in, clearly-labelled fun mode. */
export function randomScore(noteCount: number, seed: number): ScoreResult {
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const notes: NoteScore[] = Array.from({ length: noteCount }, (_, index) => ({
    note: { startMs: index * 500, endMs: index * 500 + 400, midi: 60 },
    hit: rand() > 0.35,
    cents: 0,
  }));
  const hitCount = notes.filter((n) => n.hit).length;
  const accuracy = noteCount > 0 ? hitCount / noteCount : 0;
  let bestStreak = 0;
  let streak = 0;
  for (const n of notes) {
    streak = n.hit ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }
  return { noteCount, hitCount, accuracy, bestStreak, grade: gradeFor(accuracy), notes, lines: [] };
}
```

- [ ] **Step 4: Implement `src/score/results-store.ts`**

```ts
import type { ScoreResult } from "./score";

export interface StoredResult {
  result: ScoreResult;
  funMode: boolean;
}

let last: StoredResult | null = null;

export function setLastResult(result: ScoreResult, opts: { funMode?: boolean } = {}): void {
  last = { result, funMode: opts.funMode ?? false };
}

export function getLastResult(): StoredResult | null {
  return last;
}
```

- [ ] **Step 5: Run tests to verify they pass** → PASS; commit

```bash
git add src/score/fun.ts src/score/results-store.ts tests/score/fun.test.ts tests/score/results-store.test.ts
git commit -m "feat(app): fun-mode random score + results handoff store"
```

---

### Task 6: `ResultsView`

**Files:**
- Create: `src/ui/results-view.tsx`
- Test: `tests/ui/results-view.test.tsx`

**Interfaces:**
- Consumes: `ScoreResult` (Task 4).
- Produces: `ResultsView({ result, funMode?, onSingAgain })`.

- [ ] **Step 1: Write the failing test**

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ScoreResult } from "../../src/score/score";
import { ResultsView } from "../../src/ui/results-view";

const result: ScoreResult = {
  noteCount: 4,
  hitCount: 3,
  accuracy: 0.75,
  bestStreak: 2,
  grade: "B",
  notes: [],
  lines: [],
};

describe("ResultsView", () => {
  it("shows grade, percent, streak, the fun label and fires Sing again", async () => {
    const onSingAgain = jest.fn();
    await render(<ResultsView result={result} funMode onSingAgain={onSingAgain} />);
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText(/fun mode/i)).toBeTruthy();
    await fireEvent.press(screen.getByText("Sing again"));
    expect(onSingAgain).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Implement `src/ui/results-view.tsx`**

```tsx
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { ScoreResult } from "../score/score";

export function ResultsView({
  result,
  funMode = false,
  onSingAgain,
}: {
  result: ScoreResult;
  funMode?: boolean;
  onSingAgain: () => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.container}>
      {funMode ? <Text style={styles.fun}>Fun mode — not mic-based.</Text> : null}
      <Text style={styles.grade}>{result.grade}</Text>
      <Text style={styles.percent}>{Math.round(result.accuracy * 100)}%</Text>
      <Text style={styles.sub}>
        {result.hitCount} / {result.noteCount} notes · best streak {result.bestStreak}
      </Text>
      {result.lines.length > 0 ? (
        <View style={styles.lines}>
          {result.lines.map((line, index) => (
            <View key={index} style={styles.lineRow}>
              <View style={styles.lineTrack}>
                <View style={[styles.lineFill, { width: `${Math.round(line.accuracy * 100)}%` }]} />
              </View>
              <Text style={styles.lineText}>{Math.round(line.accuracy * 100)}%</Text>
            </View>
          ))}
        </View>
      ) : null}
      <Pressable style={styles.button} onPress={onSingAgain} accessibilityRole="button">
        <Text style={styles.buttonText}>Sing again</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 12, alignItems: "center" },
  fun: { color: "#b7791f", fontWeight: "700" },
  grade: { fontSize: 72, fontWeight: "800" },
  percent: { fontSize: 28, fontWeight: "700" },
  sub: { opacity: 0.7 },
  lines: { alignSelf: "stretch", gap: 6, marginTop: 8 },
  lineRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  lineTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: "#e2e8f0", overflow: "hidden" },
  lineFill: { height: 8, backgroundColor: "#2b6cb0" },
  lineText: { width: 44, textAlign: "right", fontVariant: ["tabular-nums"] },
  button: { marginTop: 16, backgroundColor: "#2b6cb0", paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: "white", fontWeight: "700" },
});
```

- [ ] **Step 4: Run test to verify it passes** → PASS; commit

```bash
git add src/ui/results-view.tsx tests/ui/results-view.test.tsx
git commit -m "feat(app): ResultsView (grade + per-line)"
```

---

### Task 7: Results route + wire scoring into recording + fun-mode entry

**Files:**
- Create: `src/app/results/[id].tsx`
- Modify: `src/app/record/[id].tsx`, `src/ui/player-view.tsx`, `src/app/player/[id].tsx`, `docs/DEVICE-VERIFICATION.md`
- Test: `tests/ui/player-view.test.tsx` (extend)

**Interfaces:**
- Consumes: `FrameCollector` (Task 2), `detectFrames` (Task 3), `scorePerformance` (Task 4), `randomScore`/`setLastResult`/`getLastResult` (Task 5), `ResultsView` (Task 6), `extractMelody`/`parseLyrics` (`@hummyna/hmp`).
- Produces: `/results/[id]`; `PlayerView` gains `onFunScore?`.

- [ ] **Step 1: Extend the PlayerView test (red)**

```tsx
  it("triggers the fun score", async () => {
    const onFunScore = jest.fn();
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController()} onFunScore={onFunScore} />,
    );
    await fireEvent.press(screen.getByText("Fun"));
    expect(onFunScore).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run** `npx jest tests/ui/player-view.test.tsx -t "fun score"` → FAIL.

- [ ] **Step 3: Add `onFunScore?: () => void` to `PlayerView`** with a `Pressable` labeled exactly `Fun`.

- [ ] **Step 4: Run** `npx jest tests/ui/player-view.test.tsx` → PASS.

- [ ] **Step 5: Implement `src/app/results/[id].tsx`**

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { Text, View } from "react-native";
import { getLastResult } from "../../score/results-store";
import { ResultsView } from "../../ui/results-view";

export default function ResultsScreen() {
  const { id, number } = useLocalSearchParams<{ id: string; number: string }>();
  const router = useRouter();
  const stored = getLastResult();
  if (!stored) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text>No result.</Text>
      </View>
    );
  }
  return (
    <ResultsView
      result={stored.result}
      funMode={stored.funMode}
      onSingAgain={() =>
        router.replace({ pathname: "/player/[id]", params: { id, number } })
      }
    />
  );
}
```

- [ ] **Step 6: Score on recording stop (`src/app/record/[id].tsx`)**

Add imports and a collector:
```tsx
import { useRef } from "react";
import { extractMelody, parseLyrics } from "@hummyna/hmp";
import { FrameCollector } from "../../score/frames";
import { detectFrames } from "../../score/pitch";
import { scorePerformance } from "../../score/score";
import { setLastResult } from "../../score/results-store";

// inside the component:
const collectorRef = useRef<FrameCollector | null>(null);

useEffect(
  () =>
    recorder.frames((pcm, sampleRate) => {
      if (!collectorRef.current) collectorRef.current = new FrameCollector(sampleRate);
      collectorRef.current.push(pcm);
    }),
  [recorder],
);
```
Reset the collector when a new take starts (in the existing `onStart`):
```tsx
const onStart = async () => {
  collectorRef.current = null;
  const started = await controller.start();
  if (started) backing?.play();
  else backing?.stop();
};
```
In `onStop`, after the take is saved, score and navigate:
```tsx
const collector = collectorRef.current;
if (collector && midi) {
  const reference = extractMelody(midi);
  const detected = detectFrames(collector.frames(), collector.sampleRate);
  setLastResult(scorePerformance(reference, detected, { lines: parseLyrics(midi) }));
}
router.replace({ pathname: "/results/[id]", params: { id, number } });
```
(Keep the existing `if (!take || !take.uri) return;` guard BEFORE saving; score/navigate after a successful save.)

- [ ] **Step 7: Fun-mode entry in the player (`src/app/player/[id].tsx`)**

Import `extractMelody` from `@hummyna/hmp`, `randomScore` from `"../../score/fun"`, `setLastResult` from `"../../score/results-store"`, and pass to `PlayerView`:
```tsx
onFunScore={() => {
  const count = extractMelody(midi).length;
  setLastResult(randomScore(count || 20, Date.now()), { funMode: true });
  router.push({ pathname: "/results/[id]", params: { id, number } });
}}
```
(`midi` is available in `PlayerScreenInner`; thread it or compute in a handler there.)

- [ ] **Step 8: Append a "P2.4 — Scoring" section to `docs/DEVICE-VERIFICATION.md`** (sing a take → a results screen with %/grade/streak; per-line bars; "Sing again"; **Fun mode** shows the "not mic-based" label).

- [ ] **Step 9: Gate** `npm run lint` (clean) + `npm test` (all pass).

- [ ] **Step 10: Commit**

```bash
git add "src/app/results/[id].tsx" "src/app/record/[id].tsx" src/app/player/[id].tsx src/ui/player-view.tsx tests/ui/player-view.test.tsx docs/DEVICE-VERIFICATION.md
git commit -m "feat(app): score recordings + results screen + fun mode"
```

---

## Self-Review

**Spec coverage:** §4 parser/melody -> Task 1; §5 detection + FrameCollector -> Tasks 2/3; §6 scoring -> Task 4; §7 fun mode -> Tasks 5/7; §8 flow/UI -> Tasks 6/7; §9 errors -> Task 4 (no-div-by-zero), Task 7 (empty reference -> 0); §10 testing -> Tasks 1-6 (unit/render), 7 (device); §11 dep -> Task 3; §12 risks -> Task 3 (tuning), Task 1 (melody heuristic).

**Placeholder scan:** no TBD/TODO. The only tuning knob is `detectFrames` defaults (hopMs/windowMs/minClarity), fixed to concrete values in Task 3 and confirmed by its synthetic-sine tests.

**Type consistency:** `NoteEvent`/`ReferenceNote` (Task 1) consumed in Task 4/7; `FrameCollector` (Task 2) in Task 7; `DetectedFrame` (Task 3) in Tasks 4/5/7; `ScoreResult`/`scorePerformance` (Task 4) in Tasks 5/6/7; `randomScore`/`setLastResult`/`getLastResult` + `StoredResult` (Task 5) in Task 7; `ResultsView` (Task 6) in Task 7; `PlayerView.onFunScore` added in Task 7.

