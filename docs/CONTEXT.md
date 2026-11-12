# HumMyna App — Project Context

Single-file map for a fresh session. Read this, then the spec and the current plan.

## What this is
The **cross-platform karaoke player** for `.hmp` libraries — **open source**
(public repo `ezykl/hummyna-app`). It carries the open half of the format (the
**reader**, `@hummyna/hmp`). The writer/packer ("HumMyna Studio") lives in a
separate private repo.

- **Stack:** Expo SDK 58 · React Native 0.88 · React 19.3 · TypeScript ~6 ·
  expo-router · npm workspaces.
- **Format (normative):** `docs/FORMAT.md`.
- **Design spec:** `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md`.

## Roadmap (phases)
| Phase | Deliverable | Status |
|---|---|---|
| **P2.0** | Shared `.hmp` reader (`packages/hmp`) | ✅ done |
| **P2.1** | App shell + import/browse (SAF/Files, SQLite, search) | ✅ done |
| **P2.2** | Playback + synced lyrics (WebView SpessaSynth `AudioEngine`) | ✅ done |
| **P2.3** | Recording (mic → WAV take + live PCM, `expo-audio` `AudioStream`) | ✅ done |
| **P2.4** | Scoring (pitch vs reference) + fun mode | ✅ done |
| **P2.5** | Release tooling (EAS Build · internal Android APK · OTA) | ✅ done |
| **device** | On-device verification of P2.1–P2.4 | ⏳ user-driven |
| later | Autotune / voice-FX · native audio engine · store submission | out of V1 |

## Locked decisions
- React Native + Expo (EAS); **Android first**, iOS next, one codebase.
- **Shared library key bundled** in the app (community-level, not DRM) — the
  player holds the wrap-private key to decrypt `.hmp` libraries.
- **Approach C** for audio: one `AudioEngine` interface; prototype with a WebView
  synth (SpessaSynth) then ship a native Android engine (TinySoundFont + Oboe);
  iOS later (AVMIDIPlayer + AVAudioEngine).
- **V1 = all audio except autotune** (playback + lyrics + recording + scoring).
- Reader is **random-access** over a `ByteSource` with `CryptoAdapter` /
  `InflateAdapter` seams (web/Node defaults; RN adapters swap in).

## Current state — P2.0–P2.5 complete (merged to `main`)
- **P2.0:** `packages/hmp` — reader: adapters, `ByteSource`, random-access reader,
  tamper suite, `parseLyrics` (tempo map), `parseNotes`/`extractMelody` (P2.4).
- **P2.1:** Expo app shell + import/browse — RN crypto (`@peculiar/webcrypto`) /
  inflate (`pako`) adapters; `file-byte-source.ts` (SDK 58 `FileHandle` ranged
  reads); `src/library/` store/db/import/keys/storage; SAF/Documents pickers;
  screens in `src/app/`; `.github/workflows/ci.yml`.
- **P2.2:** WebView SpessaSynth `AudioEngine` (offline IIFE asset built by
  `npm run build:synth`), lyrics timeline, player route; SF2 swap-in seam.
- **P2.3:** `expo-audio` `AudioStream` `MicRecorder` (live PCM + WAV take), takes
  store, record/takes routes.
- **P2.4:** scoring — `FrameCollector`, `detectFrames` (`pitchy`),
  `scorePerformance`, `randomScore` fun mode, results route.
- **P2.5:** `eas.json` (dev/preview/production), `expo-updates` + fingerprint
  `runtimeVersion`, runtime SoundFont discovery, `docs/RELEASE.md`.
- **Green:** `npm test` = 38 vitest + 95 jest · `npm run lint` · `npm run scrub`.
  (Line counts grow as phases land.)

## Next steps
1. **Device-verify P2.1–P2.4** — `docs/DEVICE-VERIFICATION.md`. Build the `preview`
   APK (`docs/RELEASE.md`), set `HUMMYNA_LIBRARY_KEYS`, and supply a license-clear
   `.sf2`.
2. **Follow-ups (optional):** `npx expo install --fix` (align SDK patch versions),
   app icons/splash, the native Android audio engine, store submission.
   (An in-app **Settings → Select SoundFont** picker now exists.)

## Open items / risks
- **GM SoundFont (`.sf2`)** — operator provides a license-clear one; the app
  discovers it in Documents or via `HUMMYNA_SOUNDFONT`. On Android, Documents is
  app-private (needs build-time env or `adb`/`run-as`, or the planned picker).
- **Library keys** injected at build time via `app.config.js`
  (`HUMMYNA_LIBRARY_KEYS`, EAS env); no secret committed.
- **Device-only unknowns:** SAF grant + `content://` ranged reads, iOS Documents,
  the **Hermes** crypto path (`@peculiar/webcrypto`), WebView-synth audio,
  `AudioStream` capture while the synth plays (iOS session), and real singing
  accuracy. `npx expo install --check` reports SDK patch drifts — run `--fix`
  before a build.
- **Parked tech debt:** FTS5 search, import dedupe, SAF grant persistence + nested
  folders, search pagination.
- App icons/splash are not set yet (defaults used).

## How to run / verify
```bash
npm install          # workspace root
npm test             # vitest (packages/hmp) + jest (app)
npm run lint         # reader tsc + app tsc
npm run scrub        # internal-marker guard (also runs in CI)
npm run build:synth  # regenerate assets/synth/* (SpessaSynth bundle)
npm run start        # expo start (device/emulator)
npm run build        # see docs/RELEASE.md for EAS build/OTA
```

## How to continue
Read this file, the spec, and the current plan. Execute plans task-by-task,
TDD-first (red → green → commit). Start new sub-projects with `brainstorming`.
