# HumMyna Player — P2.4 Scoring (Pitch vs Reference) — Design

Status: approved (design), pending written-spec review
Date: 2026-11-05
Repo: `ezykl/hummyna-app`
Phase: P2.4 (follows P2.3 recording)
Parent spec: `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md` (§4, §9)

## 1. Goal

After a sing-along take, **score the captured voice against the song's reference
melody** and show the result: accuracy (note/line/total %), a grade, and the best
streak. Provide an explicit, clearly-labelled **fun mode** (random) for when the
mic isn't used. Deterministic and unit-tested. No autotune; no live feedback this
phase.

## 2. Scope

**In scope (P2.4):**
- Reference **melody extraction** from MIDI, added to `packages/hmp`.
- PCM **pitch detection** (the P2.3 frame seam) via `pitchy`.
- Deterministic **scoring math** + a results screen.
- **Fun mode** (opt-in random scoring), clearly labelled.
- Calibration `offsetMs` seam (fixed at 0 here), applied to alignment.

**Out of scope (P2.4):**
- Live/real-time feedback during singing; word-level scoring; autotune/voice-FX;
  calibration-offset UI; iOS polish.

## 3. Architecture

```
packages/hmp/src/
  notes.ts          parseNotes(midi) + extractMelody(midi) -> ReferenceNote[]
src/score/
  frames.ts         FrameCollector (accumulate PCM during a take)
  pitch.ts          detectFrames(pcm, sampleRate, opts) via pitchy
  score.ts          scorePerformance(reference, detected, opts) -> ScoreResult
  fun.ts            randomScore(...) for fun mode
src/ui/
  results-view.tsx  total %, grade, per-line breakdown, streak, fun-mode label
src/app/results/[id].tsx   route
```

The reader owns MIDI parsing (it already parses lyrics/tempo). Detection and
scoring are pure modules in the app, unit-tested with synthetic signals. Views are
prop-driven. Only the recording/results routes touch native + navigation.

## 4. Reference melody (`packages/hmp`, vitest-tested)

```ts
export interface NoteEvent {
  startMs: number;
  endMs: number;
  midi: number;      // MIDI note number
  velocity: number;  // 0..127
  track: number;     // track index
}

/** Note-on/off events across all tracks, tick->ms via the tempo map. */
export function parseNotes(midi: Uint8Array): NoteEvent[];

export interface ReferenceNote { startMs: number; endMs: number; midi: number; }

/** The song's singable melody as a monophonic time->pitch track. */
export function extractMelody(midi: Uint8Array): ReferenceNote[];
```

- `parseNotes` reuses the existing tempo-map logic in `packages/hmp/src/midi.ts`
  (division + FF51 tempo events) to convert ticks to ms; it collects note-on/off
  per track (running-status aware, like the lyric scanner).
- `extractMelody` picks the **lyric-bearing track** (a track containing FF05, as
  `parseLyrics` detects); fallback: the track/highest active note with the most
  note events. It then **monophonises** (when notes overlap, keep the highest
  pitch) and clamps to `endMs > startMs`. Returns notes sorted by `startMs`.

## 5. Pitch detection (`src/score/pitch.ts`, `pitchy`)

```ts
export interface DetectedFrame { timeMs: number; midi: number; cents: number; clarity: number; }

export function detectFrames(
  pcm: Float32Array,
  sampleRate: number,
  opts?: { hopMs?: number; windowMs?: number; minClarity?: number },
): DetectedFrame[];
```

- Slide a window over the PCM (default `hopMs = 40`, `windowMs = 50`; both ms,
  converted to samples via `sampleRate`); run `pitchy`'s autocorrelation to get
  `{ frequencyHz, clarity }`. A Task-1 probe confirms these against synthetic
  signals and the golden MIDI.
- Drop frames with `clarity < minClarity` (default ~0.9) or non-positive frequency.
- Convert `frequencyHz` -> fractional MIDI note; `midi = round`, `cents = (frac - midi) * 100`.
- `timeMs` = window-centre relative to the capture start (so alignment uses the
  same clock as the reference).

`FrameCollector` (`src/score/frames.ts`): `push(pcm)`, `sampleRate`, `durationMs`,
and `frames(): Float32Array` (the concatenation). Memory: mono 44.1 kHz float32 is
~10 MB/min — acceptable; note it.

## 6. Scoring (`src/score/score.ts`, pure + deterministic)

```ts
import type { LyricLine, ReferenceNote } from "@hummyna/hmp";
import type { DetectedFrame } from "./pitch";

export interface LineScore { startMs: number; endMs: number; total: number; hit: number; accuracy: number; }
export interface NoteScore { note: ReferenceNote; hit: boolean; cents: number; }

export interface ScoreResult {
  noteCount: number;
  hitCount: number;
  accuracy: number;      // 0..1, hit / total
  bestStreak: number;
  grade: string;         // S/A/B/C/D from accuracy thresholds
  notes: NoteScore[];
  lines: LineScore[];
}

export function scorePerformance(
  reference: ReferenceNote[],
  detected: DetectedFrame[],
  opts?: { offsetMs?: number; centTolerance?: number; timingToleranceMs?: number; lines?: LyricLine[] },
): ScoreResult;
```

- For each reference note, consider detected frames whose `timeMs` falls within
  `[startMs - timingToleranceMs, endMs + timingToleranceMs]` (plus `offsetMs`,
  default 0). The note is a **hit** when at least one such frame is within
  `centTolerance` (default 50 cents) of the note's pitch.
- `accuracy = hitCount / noteCount`; `bestStreak` = longest run of consecutive hits.
- `grade`: `>=0.9 S, >=0.8 A, >=0.65 B, >=0.5 C, else D`.
- `lines`: group reference notes into the provided `LyricLine[]` time spans;
  per line, `accuracy = hit / total`. Empty `lines` -> `[]`.
- Pure: same inputs -> same output (no clock, no randomness).

## 7. Fun mode (`src/score/fun.ts`)

```ts
export function randomScore(noteCount: number, seed: number): ScoreResult;
```

An explicit, opt-in alternative: a deterministic pseudo-random `ScoreResult`
(seeded) so the UI can show a playful result when the user chooses "no mic".
The results screen **must** label it **"Fun mode — not mic-based."**

## 8. Flow & UI

1. Recording route (`record/[id]`) subscribes to `frames()`, feeding a
   `FrameCollector` while recording (monitoring stays off).
2. On stop: `const take = await recorder.stop()`; then
   `detectFrames(collector.frames(), collector.sampleRate)` +
   `extractMelody(midi)` + `scorePerformance(reference, detected, { lines })`.
3. Save the take (as today) and navigate to `/results/[id]`. The `ScoreResult`
   is handed off via a tiny in-memory module `src/score/results-store.ts`
   (`setLastResult(r)` / `getLastResult()`), so the results route renders
   recompute-free; a missing result renders the "no result" empty state.
4. `ResultsView`: big total %, grade, per-line bars, best streak, and the fun-mode
   label when set. A "Sing again" action returns to the player.

`midi` for the reference is already available in the recording route (it loads the
song for playback), so `extractMelody(midi)` needs no extra I/O.

## 9. Error handling

- No detectable pitch / silence -> accuracy handled gracefully (`noteCount>0`,
  `hitCount=0`); never divide by zero.
- `extractMelody` empty (no notes) -> results screen shows "No reference melody
  for this song."
- Missing key / corrupt song -> the existing friendly messages.
- `pitchy` failure on a frame -> skipped frame (never throws out of `detectFrames`).

## 10. Testing

- **vitest (`packages/hmp`):** `parseNotes` on the golden MIDI fixtures -> expected
  note count/pitches; `extractMelody` -> monophonic, sorted, within duration.
- **jest (app):** `detectFrames` on synthetic sines (A440 -> midi 69 ±1 cent,
  220 Hz -> midi 57; white noise -> dropped by clarity); `scorePerformance` on
  crafted inputs (all-hit -> 1.0/S; half-hit -> 0.5/C; streak correctness; line
  grouping; offset shifts hits); `randomScore` determinism (same seed -> same
  result, different seeds differ, ranges valid).
- **Device-manual:** real singing produces a sensible score; added to
  `docs/DEVICE-VERIFICATION.md`.

## 11. New dependencies

`pitchy` (0BSD) — app-side only (`packages/hmp` gains no deps).

## 12. Risks / open items

- **`pitchy` window/hop tuning** — defaults chosen in Task 1; a Task-1 probe
  establishes them against synthetic signals and the golden MIDI.
- **Melody-track heuristic** — lyric-track detection may fail on unusual files;
  the highest-note fallback covers it, and it is switchable.
- **Frame memory** — accumulating a full take is ~10 MB/min; acceptable for v1.
- **Monophonic assumption** — reference is reduced to one pitch at a time.

## 13. Deferred (YAGNI)

Live feedback, calibration-offset UI, word/syllable scoring, weighted-by-duration
scoring, autotune/voice-FX, iOS polish, publishing `packages/hmp`.
