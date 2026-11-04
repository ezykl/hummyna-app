# HumMyna Player — P2.2 Playback + Synced Lyrics — Design

Status: approved (design), pending written-spec review
Date: 2026-11-02
Repo: `ezykl/hummyna-app`
Phase: P2.2 (follows P2.1 app shell + import/browse)
Parent spec: `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md` (§4, §7)

## 1. Goal

Let a user open an imported song and **sing along**: play its MIDI through a
soundfont synth while its lyrics scroll and highlight **in sync** with the music,
with transport controls (play/pause/stop/seek/volume). Android first, iOS parity;
offline; no accounts.

This phase ships the **WebView SpessaSynth engine** only (Approach C, step 1). A
native Android engine (TinySoundFont + Oboe) is a later phase that implements the
same `AudioEngine` seam.

## 2. Scope

**In scope (P2.2):**
- One `AudioEngine` interface; a `WebViewSynthEngine` implementation.
- A SoundFont **provider seam** (swap-in) with a placeholder for now.
- Lyric timeline math over the existing `parseLyrics(midi) → LyricLine[]`
  (`packages/hmp`), rendered as a highlighted, auto-scrolling current line.
- Player screen (route `player/[id]`), launched from a library's song list.
- Transport UI + a `usePlayer` hook; screen kept awake during playback.
- Friendly errors for corrupt/foreign files, missing key, engine failures.

**Out of scope (P2.2):**
- Recording, scoring, takes (P2.3/P2.4).
- Native Android/iOS audio engines (later).
- Word/syllable-level karaoke highlighting (FF05 gives line-level timing only).
- Autotune/voice-FX.
- Downloading libraries, cloud, accounts.

## 3. Architecture

```
src/audio/
  engine.ts                 AudioEngine interface + transport types (the seam)
  webview-synth-engine.tsx  WebViewSynthEngine implements AudioEngine
  synth-html.ts             embedded HTML/JS hosting SpessaSynth
  sf2.ts                    SoundFont provider (swap-in); placeholder for now
  use-player.ts             React hook: engine -> component state
src/lyrics/
  timeline.ts               pure: currentLineIndex / lineProgress (+ offset)
src/ui/
  player-view.tsx           transport + lyrics layout (presentational)
  lyrics-view.tsx           current-line highlight + auto-scroll (presentational)
src/app/player/[id].tsx     route: load library+song -> midiFor -> parseLyrics+engine
```

The player is composed of **small units with one purpose**: `timeline.ts` is pure
math; `engine.ts` is the contract; the WebView engine is the only unit that talks
to a WebView; the views are prop-driven and render under jest with fakes.

## 4. `AudioEngine` (the seam)

```ts
export interface AudioEngine {
  /** Boot the synth and load the SoundFont. Idempotent. */
  init(): Promise<void>;
  /** Replace the current song (MIDI file bytes). */
  load(midi: Uint8Array): Promise<void>;
  play(): void;
  pause(): void;
  stop(): void;
  seek(sec: number): void;
  isPlaying(): boolean;
  /** Current playhead in seconds. */
  position(): number;
  /** Song length in seconds (0 until loaded). */
  duration(): number;
  setVolume(v: number): void; // 0..1
  /** Subscribe to playhead updates; returns an unsubscribe. */
  onProgress(cb: (sec: number) => void): () => void;
  /** Tear down the WebView / release resources. */
  dispose(): void;
}
```

This is the parent spec's §4 interface plus `init()` and `isPlaying()` (needed to
boot the synth and drive the button state). A future `NativeAndroidEngine`
implements the same interface; consumers never depend on the WebView.

## 5. WebView synth integration

`WebViewSynthEngine` renders a `react-native-webview` whose `source` is the
`synth-html.ts` document (bundled string, no network). RN ↔ WebView talk over a
JSON `postMessage` bridge.

**RN → WebView** messages:
```
{ id, type: "init" }                       // boot SpessaSynth, ack ready
{ id, type: "loadSf2", data: <base64> }    // soundfont bytes
{ id, type: "loadMidi", data: <base64> }   // MIDI file bytes
{ id, type: "play" | "pause" | "stop" }
{ id, type: "seek", sec: number }
{ id, type: "volume", value: number }      // 0..1
```
**WebView → RN** events:
```
{ type: "ready" }
{ type: "progress", sec: number }          // ~10 Hz while playing
{ type: "ended" }
{ type: "error", message: string }
```

Promises for `init`/`load*` resolve when the matching `id` is acked; a rejected
`error` for that `id` rejects the promise. **Payloads (SF2, MIDI) are passed as
base64 in v1** — simplest cross-platform (esp. WKWebView `file://` restrictions).
If a real SF2 makes this too large/memory-heavy, switch to file-URL serving
(sub-spike; see Risks). Booting the WebView, SpessaSynth, and SF2 loading are
**device-verified**, not jest-verified.

## 6. SoundFont provider (swap-in)

```ts
export type SoundFontSource =
  | { kind: "asset"; module: number }        // require() -> expo-asset
  | { kind: "file"; uri: string };           // downloaded/cached file

/** Resolve to bytes for the WebView. Placeholder until the operator provides one. */
export async function soundFontBytes(): Promise<Uint8Array>;
```

`soundFontBytes()` is the **single swap-in point**. P2.2 ships a small placeholder
(a few GM instruments) so the pipeline is exercised; the operator later drops a
license-clear `.sf2` (bundled asset or download-on-first-run) with no engine/UI
changes. Bundled asset is read via `expo-asset`; file via `expo-file-system`.

## 7. Lyric timeline (pure, unit-tested)

```ts
import type { LyricLine } from "@hummyna/hmp";

/** Index of the line active at `timeMs` (‑1 before the first line). */
export function currentLineIndex(lines: LyricLine[], timeMs: number): number;
/** Progress within the current line, 0..1 (uses the next line's start; last line = 0). */
export function lineProgress(line: LyricLine, next: LyricLine | undefined, timeMs: number): number;
```

`timeMs = engine.position() * 1000 + offsetMs`. `offsetMs` is a calibration seam
fixed at **0** in P2.2 (UI deferred); the math already takes it as a parameter so
adding the control later is local. Lines come from `parseLyrics(midiFor(ref))`;
if there are none, the view shows "No lyrics for this song."

## 8. Player screen and UI

- **Route** `src/app/player/[id].tsx`, params `{ id: libraryId, number: songNumber }`.
  Also reachable by tapping a song row in `src/ui/library-view.tsx`.
- **Data flow:** `openLibraryDb()` → `getLibrary(id)` → `fileByteSource(library.path)`
  → `openHmp(source, libraryKeys(), { crypto: rnCryptoAdapter, inflate:
  rnInflateAdapter })` → find the `SongRef` whose `number` matches the param →
  `midiFor(ref)` → `parseLyrics(midi)` + `engine.load(midi)`. The `ByteSource` is
  closed after `midiFor`. Title/singer come from the matched `SongRef`.
- **Store addition** (`src/library/store.ts`): `getLibrary(id): Promise<Library|null>`
  (a one-liner over the `libraries` table). No `getSong` needed — the song is
  identified by `number` within its library.
- **UI:** title/singer header; a lyric panel (current line prominent, neighbours
  dimmed, auto-scroll to keep the current line centred); transport row
  (play/pause, stop, a seek bar bound to `position()/duration()`, volume).
- `usePlayer(engine, midi, lyrics)` owns transport state and subscribes to
  `onProgress`; `dispose()` on unmount; `expo-keep-awake` while playing.

## 9. Error handling

- Corrupt/foreign `.hmp`, or a song that fails to decrypt/inflate → a friendly
  banner ("Couldn't open this song") and stay on the list; never a crash.
- Missing library keys → the same clear message used by import.
- Engine/WebView error after `init`/`load` → banner + retry; `dispose()` cleanly.
- Audio focus / interruption / background: P2.2 pauses on background (best-effort);
  full focus handling is deferred to the native-engine phase.

## 10. Testing

- **Unit (jest):** `timeline.ts` (`currentLineIndex`, `lineProgress`, offset,
  empty/edge cases); store `getLibrary`; a **fake `AudioEngine`** transport
  contract test (play/pause/stop/seek/volume/onProgress state machine).
- **Render (jest-expo + @testing-library/react-native):** `LyricsView` highlights
  the correct line for a given `timeMs`; `PlayerView` shows the right button state
  driven by a fake engine.
- **Device-manual (not jest):** WebView synth actually makes sound; SF2 loads;
  latency; seek accuracy; keep-awake; interruption behaviour. Added to
  `docs/DEVICE-VERIFICATION.md`.

## 11. New dependencies

`react-native-webview` (host the synth), `expo-asset` (bundle SpessaSynth + SF2),
`expo-keep-awake` (screen on during playback). `expo-file-system` already present.
Audio-session/focus (`expo-audio`) deferred with the native engine.

## 12. Risks / open items

- **SoundFont asset delivery:** base64 over the bridge may be heavy for a real SF2;
  fallback is file-URL serving via `allowFileAccess`/`allowingReadAccessToURL`. Sub-spike.
- **SpessaSynth size + license:** Apache-2.0 (fine); bundle size and startup cost to
  watch. The SF2 remains the operator's license-clear deliverable.
- **WebView audio latency** is acceptable for a prototype but worse than a native
  engine — the reason Approach C steps toward native later.
- **iOS WKWebView** asset/file access differs from Android; verify on device.

## 13. Deferred (YAGNI)

Calibration-offset UI (seam only), word-level highlighting, backing-track volume
balance, native engines, audio focus / interruption polish, karaoke FX.
