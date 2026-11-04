# HumMyna Player — P2.3 Recording (Sing-along) — Design

Status: approved (design), pending written-spec review
Date: 2026-11-05
Repo: `ezykl/hummyna-app`
Phase: P2.3 (follows P2.2 playback + synced lyrics)
Parent spec: `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md` (§4, §8)

## 1. Goal

Let a user **sing along**: from the player, start recording while the backing
track plays, capture the voice, save it as a **take**, and later play or delete
takes for that song. The same capture also yields live **PCM frames** — the input
the (P2.4) scorer and a future autotune phase will consume.

Mic monitoring is **off** (no feedback). This phase is Android-first, iOS parity,
offline, account-free.

## 2. Scope

**In scope (P2.3):**
- One `MicRecorder` interface (spec §4) + an `expo-audio` `AudioStream` impl.
- Sing-along record flow from the player: backing plays + mic records → WAV take.
- Live PCM frame delivery (a `frames()` seam) + a simple input-level meter.
- A **takes** store (SQLite metadata) + a per-song takes list (play voice, delete).
- Mic permission + audio-session handling; friendly errors.

**Out of scope (P2.3):**
- Scoring (P2.4); autotune / voice-FX; mixing the take with the backing;
  AAC/compressed takes; background recording; iOS-specific polish.

## 3. Architecture

```
src/audio/
  mic-recorder.ts        MicRecorder interface + Take type + FakeMicRecorder (test)
  expo-mic-recorder.ts   AudioStream-backed impl (permission, session, WAV, PCM)
  use-recorder.ts        hook: idle|recording|saving|error + elapsed + level
src/library/
  takes.ts               SQLite `takes` table + TakesStore (add/list/get/delete)
src/ui/
  record-view.tsx        record/stop + timer + level (presentational)
  takes-view.tsx         takes list + play/delete (presentational)
src/app/record/[id].tsx  route: load song -> play backing + record -> save take
```

Units have one purpose each: the recorder owns the native capture; the store owns
metadata; the views are prop-driven and render under jest with fakes; the route
is the only unit that wires native + navigation together.

## 4. Capture: `expo-audio` `AudioStream`

SDK 58 `expo-audio` exposes `useAudioStream()` / `AudioStream` — a native,
real-time **PCM** microphone capture with optional **file** recording. One capture
serves both the take and scoring, with **no custom NDK module**.

```ts
export interface Take {
  uri: string;
  durationMs: number;
  sampleRate?: number;
}

export interface MicRecorder {
  /** Request mic permission and configure the audio session. Idempotent. */
  prepare(): Promise<void>;
  /** Begin capture (PCM events + WAV file). */
  start(): void;
  /** Subscribe to PCM frames; returns an unsubscribe. */
  frames(cb: (pcm: Float32Array, sampleRate: number) => void): () => void;
  /** Stop capture and resolve the finished take. */
  stop(): Promise<Take>;
  /** Release native resources. */
  dispose(): void;
}
```

`ExpoMicRecorder` wraps `AudioStream`:
- `prepare()` → `AudioModule.requestRecordingPermissionsAsync()`; `setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true })`; monitoring stays off (no input routed to output).
- `start()` → `stream.start()`, then `stream.startFileRecordingAsync({ directory: "document" })` (writes a **WAV**).
- PCM events are normalized to **`Float32Array`** (converted from the stream's raw payload if it is Int16) and fanned out to `frames()` subscribers.
- `stop()` → `stopFileRecordingAsync()` / `stream.stop()` → `{ uri, durationMs, sampleRate }`.
- `dispose()` → `stream.stop()` + unsubscribe.

**Spike (Task 1):** confirm the exact `AudioStream` event payload shape (Int16 vs
Float32, channel layout, sample rate) and that it exists in the installed
`expo-audio` version; record findings. This is the one genuine unknown.

## 5. Sing-along record flow

1. Player → **Record** → route `record/[id]` (`{ id: libraryId, number }`).
2. Load the library + song (as in P2.2); build the P2.2 `AudioEngine` for backing.
3. `recorder.prepare()` → `engine.load(midi)` → `engine.play()` + `recorder.start()`.
4. While recording: `frames()` drives a level meter (and is reserved for P2.4).
5. **Stop** → `engine.stop()` + `const take = await recorder.stop()`.
6. Save: move/keep the WAV under Documents (`takes/`), then
   `takes.addTake({ libraryId, number, path, durationMs })`.
7. Navigate to the takes list for that song.

Audio-session note: recording while the WebView synth plays is a **device risk**
(iOS session conflicts). Task 1 verifies it; if it fails on iOS, the fallback is
to record with the backing muted/stopped and document it.

## 6. Takes store (`src/library/takes.ts`)

Reuses the existing `SqliteAdapter` seam and the store DB (`openLibraryDb`). New
table + migration, added to `src/library/store.ts`'s schema (or a sibling
`migrateTakes` invoked alongside it):

```sql
CREATE TABLE IF NOT EXISTS takes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_takes_song ON takes(library_id, number);
```

```ts
export interface TakeRecord {
  id: number; libraryId: number; number: number;
  path: string; createdAt: number; durationMs: number;
}
export interface TakesStore {
  addTake(input: { libraryId: number; number: number; path: string; durationMs: number }): Promise<number>;
  listTakes(libraryId: number, number: number): Promise<TakeRecord[]>;
  getTake(id: number): Promise<TakeRecord | null>;
  deleteTake(id: number): Promise<void>;
}
```

`deleteTake` removes the row; the caller also deletes the WAV file (best-effort).

## 7. UI

- **`RecordView`** (`record-view.tsx`): song title/singer; a big record/stop
  button; elapsed timer; an input-level bar driven by `level`; disabled while
  saving; shows permission/error messages.
- **`TakesView`** (`takes-view.tsx`): list of takes (`date`, `duration`), each with
  **Play** (voice-only, via `expo-audio` `useAudioPlayer`) and **Delete**;
  an empty state.
- **Entry points:** a **Record** button on `PlayerView`, and a **Takes** link for a
  song in the library detail list.

## 8. Error handling

- Mic permission denied → a clear message + how to enable it (no crash).
- Recorder/stream error → banner; discards an empty take.
- Missing key / corrupt `.hmp` → the existing friendly import/player messages.
- Deleting a take removes the row even if the WAV is already gone.

## 9. Testing

- **Unit (jest):** `takes.ts` over `node:sqlite` (add/list/get/delete, ordering);
  `useRecorder` state machine with `FakeMicRecorder` (idle→recording→saving,
  elapsed, level, permission-denied error); `RecordView`/`TakesView` render +
  interactions.
- **Device-manual (not jest):** real `AudioStream` PCM + WAV validity, mic while
  the synth plays, permissions/session, `expo-audio` playback of a take. Added to
  `docs/DEVICE-VERIFICATION.md`.

## 10. New dependencies

`expo-audio` (capture + take playback), with its config plugin configured for the
microphone permission (`microphonePermission` / `recordAudioAndroid`).

## 11. Risks / open items

- **`AudioStream` payload shape + availability** — the Task 1 spike.
- **Record-while-playing session behavior** differs Android vs iOS; may need to
  mute/stop the backing on one platform.
- **WAV size** — uncompressed voice; a multi-minute take is a few MB (acceptable
  for v1; compressed takes later).
- PCM fan-out cost if consumers are heavy — fine for a meter; P2.4 will control.

## 12. Deferred (YAGNI)

Scoring (P2.4), take+backing mixing, AAC encoding, autotune/voice-FX, background
recording, iOS audio polish, per-device keys.
