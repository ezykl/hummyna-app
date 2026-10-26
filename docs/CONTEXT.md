# HumMyna App — Project Context

Single-file map for a fresh session. Read this, then the spec and the current plan.

## What this is
The **cross-platform karaoke player** for `.hmp` libraries — **open source**
(public repo `ezykl/hummina-app`). It carries the open half of the format (the
**reader**, `@hummina/hmp`). The writer/packer ("HumMyna Studio") lives in a
separate private repo.

- **Stack:** Expo SDK 58 · React Native 0.88 · React 19.3 · TypeScript ~6 ·
  expo-router · npm workspaces.
- **Format (normative):** `docs/FORMAT.md`.
- **Design spec:** `docs/superpowers/specs/2026-10-21-hummina-app-phase2-design.md`.

## Roadmap (phases)
| Phase | Deliverable | Status |
|---|---|---|
| **P2.0** | Shared `.hmp` reader (`packages/hmp`) | ✅ done |
| **P2.1** | App shell + import/browse (SAF/Files, SQLite, search) | 🚧 in progress |
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

## Current state
- **P2.0 complete:** `packages/hmp` — constants, adapters (inflate/crypto),
  `ByteSource`, random-access reader (verified vs golden `.hmp`), tamper suite,
  `parseLyrics` (tempo map), public API. **31 vitest tests**.
- **P2.1 Task 2 done:** repo is an Expo app (expo-router; routes in `src/app/`);
  npm workspaces; `@hummina/hmp` wired; `app.json` ids `app.hummina` +
  iOS `UIFileSharingEnabled`/`LSSupportsOpeningDocumentsInPlace`;
  `metro.config.js` monorepo config; `main: expo-router/entry`.
  **Green:** `npm run lint` (reader tsc + app tsc) · `npm test` = 31 vitest + 1 jest.
- No uncommitted work expected; continue on the `p2.1-app-shell` branch (or a new
  branch off it).

## Next steps (P2.1 tasks 3–9 — see the plan)
`docs/superpowers/plans/2026-10-21-hummina-app-p2.1-app-shell.md`

3. RN inflate adapter (`fflate`) — quick, Node-testable.
4. **SPIKE** — `ByteSource` over `expo-file-system` (ranged reads over `content://`).
1. **SPIKE** — RN **crypto strategy** (choose `react-native-quick-crypto` vs
   pure-JS `@peculiar/webcrypto` / `node-forge`+`@noble/*`), then implement
   `rnCryptoAdapter`.
5. SQLite library store + search · 6. import flow · 7. folder/file pickers
   (**device-verified**) · 8. browse/search screens · 9. CI + storage mgmt.

## Open items / risks
- **GM SoundFont (`.sf2`)** — the operator provides a license-clear one before
  P2.2 (playback).
- The two **spikes** above are the real unknowns (headless can't verify native
  audio/ranged reads).
- Component tests may want `@testing-library/react-native` (its install hit an
  ERESOLVE previously resolved by pinning `react-dom@19.3.0`).
- App icons/splash are not set yet (defaults used).

## How to run / verify
```bash
npm install          # workspace root
npm test             # vitest (packages/hmp) + jest (app)
npm run lint         # reader tsc + app tsc
npm run start        # expo start (device/emulator)
```

## How to continue
Read this file, the spec, and the P2.1 plan. Execute the plan task-by-task,
TDD-first (red → green → commit), or via the subagent-driven-development skill.
