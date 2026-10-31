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
| **P2.1** | App shell + import/browse (SAF/Files, SQLite, search) | ✅ done (device checks pending) |
| P2.2 | Playback + synced lyrics (AudioEngine) | planned |
| P2.3 | Recording (mic → take + PCM for scoring) | planned |
| P2.4 | Scoring (pitch vs reference) + random fallback | planned |
| P2.5 | Release (EAS Build → Android, then iOS) | planned |
| later | Autotune / voice-FX | out of V1 |

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

## Current state — P2.1 complete (merged to `main` @ 86303dd)
- **P2.0:** `packages/hmp` — constants, adapters (inflate/crypto), `ByteSource`,
  random-access reader (verified vs golden `.hmp`), tamper suite, `parseLyrics`
  (tempo map), public API.
- **P2.1:** Expo app shell + import/browse.
  - RN adapters: `src/platform/rn-crypto.ts` (`@peculiar/webcrypto`),
    `src/platform/rn-inflate.ts` (`pako`, raw deflate).
  - `src/platform/file-byte-source.ts` — `ByteSource` over SDK 58
    `expo-file-system` `FileHandle` **random-access reads** (no native module
    needed); `close()` releases the FD.
  - `src/library/` — `store.ts` (pure SQLite logic + `SqliteAdapter` seam),
    `db.ts` (expo-sqlite binding, memoized), `import.ts`, `keys.ts`,
    `storage.ts`.
  - `src/platform/pick-library.ts` — Android SAF / iOS Documents folder pickers.
  - `src/ui/library-view.tsx` + routes in `src/app/` (`index.tsx`,
    `library/[id].tsx`).
  - CI: `.github/workflows/ci.yml` (Node 22 · `npm ci` · lint · test · scrub).
  - **Green:** `npm test` = 31 vitest + 30 jest · `npm run lint` · `npm run scrub`.

## Next steps
1. **Device-verify P2.1** — see `docs/DEVICE-VERIFICATION.md`. Needs the operator's
   real key in `HUMMYNA_LIBRARY_KEYS` (else import can't decrypt).
2. **P2.2 — Playback + synced lyrics (AudioEngine)** — the next sub-project.
   Requires a license-clear GM **SoundFont (`.sf2`)** from the operator. New
   creative work → run `brainstorming` → spec → plan before coding.
3. Later phases: P2.3 recording · P2.4 scoring · P2.5 release (EAS Build).

## Open items / risks
- **GM SoundFont (`.sf2`)** — operator provides a license-clear one before P2.2.
- **Library keys** must be injected at build time via
  `app.config.js` → `expo.extra.hummynaLibraryKeys` (env `HUMMYNA_LIBRARY_KEYS`);
  no secret is committed. Import fails loudly if unset.
- **Device-only unknowns:** SAF folder grant + `content://` ranged reads, iOS
  Documents listing, and the **Hermes** crypto path (`@peculiar/webcrypto` is
  proven only on Node/V8).
- **Parked P2.1 tech debt:** FTS5 search (currently indexed `LIKE` columns),
  import dedupe, SAF grant persistence + nested folders, search pagination.
- App icons/splash are not set yet (defaults used).

## How to run / verify
```bash
npm install          # workspace root
npm test             # vitest (packages/hmp) + jest (app)
npm run lint         # reader tsc + app tsc
npm run scrub        # internal-marker guard (also runs in CI)
npm run start        # expo start (device/emulator)
```

## How to continue
Read this file, the spec, and the current plan. Execute plans task-by-task,
TDD-first (red → green → commit). Start new sub-projects with `brainstorming`.
