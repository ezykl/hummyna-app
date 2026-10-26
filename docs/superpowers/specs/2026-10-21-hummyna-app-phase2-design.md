# HumMyna Player (`hummyna-app`) — Phase 2 Design

Status: approved (design), pending written-spec review
Date: 2026-10-21
Repo: `ezykl/hummyna-app` (public / open source)

## 1. Goal & context

The **HumMyna player** is the cross-platform karaoke app that sings `.hmp`
libraries produced by HumMyna Studio (`ezykl/hummina`, private). This is the
**open-source half** of the ecosystem: the app, and the `.hmp` **reader** it
carries, are public so anyone can build on the format. The Studio (writer /
packer) and its signing keys stay private.

V1 is a full vertical slice: import a `.hmp` library, browse/search, and **sing**
— MIDI playback with synced lyrics, **recording**, and **scoring** (mic-based,
with an explicit random-scoring "fun mode"). Autotune / voice-FX is later.

## 2. Scope

**In scope (V1):** shared `.hmp` reader; library import from device storage;
browse/search; playback + synced lyrics; recording; scoring + random fallback;
Android release first, iOS next.

**Out of scope (V1):** autotune / voice-FX; server, accounts, sync, or
downloading libraries; bundling a starter library; iOS-specific polish beyond
parity; the Studio/packer (separate private repo).

**Explicitly not V1:** cloud features, community MIDI sharing, karaoke effects
(echo/reverb), pitch-correction.

## 3. Stack & repo

- **React Native + Expo (EAS)**, TypeScript. Reuses the Phase-1 TypeScript
  `.hmp` reader.
- Single public repo `ezykl/hummyna-app`, with the reader as a workspace package
  `packages/hmp` (publishable later).
- **No functional dependency on a domain**; the app is offline and account-free.
- Android first (EAS Build → Play internal testing), then iOS in the same
  codebase.

## 4. Architecture

```
app/                     screens (Expo Router)
  library/               import + browse/search
  player/                playback + lyrics
  record/                recording + takes
  results/               scores
src/
  library/               SQLite store, import, search
  audio/                 AudioEngine interface + impls
  score/                 pitch detection + scoring math
  lyrics/                MIDI timeline (tick->ms)
packages/hmp/            shared .hmp reader (open-source format half)
docs/FORMAT.md           public format doc (copy)
```

**AudioEngine (approach C — interface, swap-in engines):**

```ts
interface AudioEngine {
  load(midi: Uint8Array): Promise<void>;
  play(): void; pause(): void; stop(): void; seek(sec: number): void;
  position(): number; duration(): number; setVolume(v: number): void;
  onProgress(cb: (sec: number) => void): () => void;
  dispose(): void;
}
interface MicRecorder {
  start(): void;
  frames(cb: (pcm: Float32Array, sampleRate: number) => void): () => void;
  stop(): Promise<Take>;
}
```

- **`WebViewSynthEngine`** (SpessaSynth, Apache-2.0, in `react-native-webview`)
  — built first (fast vertical slice + iOS fallback).
- **`NativeAndroidEngine`** (TinySoundFont MIT via NDK + **Oboe**) — the Android
  release default (low latency). iOS later via `AVMIDIPlayer` + `AVAudioEngine`.

**Decision — library key.** Songs are encrypted to the wrap **public** key, so
any player needs the matching **wrap-private** to decrypt. V1 **bundles a shared
library key** in the app (community-level, consistent with the Studio's "not
DRM" stance). Per-device keys are a later option.

## 5. Shared reader (`packages/hmp`)

Ported from Phase 1, adapted for React Native. Random-access, never whole-file:

```ts
openHmp(source: ByteSource, keys: LibraryKeys): Promise<HmpLibrary>
// HmpLibrary: { songCount, songs(): SongRef[], verify(): Promise<boolean>,
//               midiFor(ref): Promise<Uint8Array>, getLyrics(ref) }
// SongRef:     { number, title, singer, offset, length }
```

- **`ByteSource` = random access over a URI** (`content://` on Android SAF,
  `file://` in the iOS container): read the 76-byte footer → index offset →
  index (verify with `sign-public`) → unwrap the content key once (shared
  wrap-private) → decrypt each song lazily.
- **Platform adapters** behind one interface: `CryptoAdapter` (RSA-OAEP unwrap,
  AES-GCM, ECDSA verify) and `InflateAdapter` (raw deflate). Node/Web impls
  (WebCrypto + `CompressionStream`) for tests; RN impls
  (`react-native-quick-crypto` + `fflate`) on device.
- **Lyrics** parsed from the decrypted MIDI (FF05/FF01) → timed lines.
- **Tests:** reuse Phase-1 golden vectors + tamper suite + MIDI probes under
  Node with the web adapters.

⚠️ **Spike:** RN file range-reads (Expo `expo-file-system`) may not support
arbitrary position/length over `content://`; if not, add a tiny native
file-access module.

## 6. App shell + library import/browse (P2.1)

- **Stack:** Expo (dev client) + TypeScript + **Expo Router**; light store
  (**Zustand**). Offline, no accounts.
- **Library location:** Android uses a user-chosen **SAF folder** (persisted
  read/write) so `.hmp` files are read **in place** (no 800 MB copy); iOS uses
  the **Files-app-visible app Documents folder**
  (`UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace`). A document
  picker import is the fallback for a single file.
- **Import:** copy-or-reference the `.hmp` → open with `packages/hmp` → read the
  index → write song rows to **SQLite** (`expo-sqlite`), storing
  `{path, number, title, singer, offset, length}` (never the bytes).
- **Search:** SQLite FTS over number/title/singer.
- **Storage mgmt:** show size/song-count; warn on low space; delete removes the
  file + rows.

## 7. Playback + lyrics (P2.2)

- Engine per Section 4. **Lyrics timeline:** parse header division + **tempo
  events** (tick→ms map), emit timed FF05 (fallback FF01) lines; the player
  shows the current line and highlights progress from `onProgress`.
- **SoundFont (`.sf2`)**: both synths need one for GM playback. **User supplies a
  license-clear SF2**; V1 bundles a compact permissive SF2 (size permitting) with
  optional download-on-first-run.
- **Latency & robustness:** native target ~10–20 ms; a **user calibration
  offset** aligns lyrics/scoring; handle interruptions, audio focus, keep-awake.

## 8. Recording (P2.3)

- `MicRecorder` (Section 4): one capture feeds the **scorer** (PCM frames) and a
  saved **take**.
- **Android-first native:** Oboe input → PCM → scorer + encode a take (WAV for
  V1; AAC later).
- Permissions/audio-focus handled; **monitoring off by default** (feedback).
- **Takes library:** SQLite metadata (song, date, duration); list/play/delete;
  optional mix with backing.
- **iOS later:** `AVAudioEngine` input tap. Captured PCM is the input for the
  future autotune/voice-FX phase.

## 9. Scoring (P2.4)

- **Reference pitch from the MIDI:** time→expected-note track derived from the
  **lyric-bearing (melody) track** (fallback: highest active note; switchable).
- **Detection:** `pitchy` (0BSD) autocorrelation (~40–50 ms hop) → note + cents;
  discard low-clarity frames.
- **Alignment:** map frames via the calibration offset.
- **Scoring (tunable):** per-note hit within ±semitone + timing window →
  note/line/total %, streak/combo, grade. Deterministic, unit-tested.
- **Random "fun mode":** explicit, opt-in, clearly labeled as not mic-based.
- **Ethics:** mic scoring only with permission; no deceptive scoring.

## 10. Cross-cutting

- **Data flow:** import → SQLite; open → reader (ranged read) → MIDI → engine +
  lyrics + reference pitch; play → progress → UI; record → PCM → scorer + take;
  results → SQLite.
- **Errors:** corrupt/foreign `.hmp` → friendly skip; missing key → message;
  permission denied → guidance; no SAF → picker fallback; low storage → warn;
  interruptions → pause/resume.
- **Testing:** `jest-expo` unit tests (store, import, scoring math, recorder
  contract via fake, theme); the reader's Node-adapter suite; **device-manual**
  for native audio latency, SAF, real mic, WebView synth.
- **Release:** EAS Build → Play internal testing (Android), then iOS. Pin
  `runtimeVersion`; ship JS-only fixes via **EAS Update**. CI = lint + unit
  tests. Publish `FORMAT.md` + **public** keys (done: public repo).
- **Risks:** native audio latency; SAF ranged reads; WebView-synth limits;
  SoundFont size/licensing; Expo **dev-client** requirement (no Expo Go); iOS
  file-access differences.

## 11. Key decisions & open items

- **Decided:** RN + Expo; Android-first; approach C (interface + WebView
  prototype → native Android engine); V1 = all audio except autotune; shared
  library key bundled; separate public repo `ezykl/hummyna-app`.
- **Open:** the GM **SoundFont (`.sf2`)** — user to provide/create (license-clear).
- **Open:** `ByteSource` ranged-read spike over `content://`.
- **Later:** per-device keys; autotune/voice-FX; iOS audio engine; publish
  `packages/hmp` to npm.
