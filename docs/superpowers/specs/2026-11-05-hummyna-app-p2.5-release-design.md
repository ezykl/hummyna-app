# HumMyna Player — P2.5 Release Tooling + Internal Build — Design

Status: approved (design), pending written-spec review
Date: 2026-11-05
Repo: `ezykl/hummyna-app`
Phase: P2.5 (follows P2.4 scoring)
Parent spec: `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md` (§10, §3)

## 1. Goal

Make the app **installable and verifiable on a device** (an internal Android APK)
and set up over-the-air update plumbing — so `docs/DEVICE-VERIFICATION.md` can be
run end-to-end. **Not** a store release: Play/iOS submission is a later, smaller
step once device verification passes.

## 2. Scope

**In scope (P2.5):**
- `eas.json` with `development` / `preview` / `production` profiles.
- `expo-updates` + `runtimeVersion: { policy: "fingerprint" }` + channels.
- Library keys injected at build time via an **EAS environment variable/secret**
  (`HUMMYNA_LIBRARY_KEYS`), consumed by the existing `app.config.js`.
- A **runtime SoundFont source** so the operator can drop a license-clear `.sf2`
  into the app's Documents dir on device.
- `docs/RELEASE.md` (build/install/verify + EAS env & secret setup) and
  `DEVICE-VERIFICATION.md` prerequisite updates.

**Out of scope (P2.5):**
- Play Store / App Store submission, iOS build, EAS Workflows / CI-driven builds.
- Committing an SF2 or any secret.
- Icons/splash polish (defaults remain; called out as an open item).

## 3. Deliverables

```
eas.json                     build profiles (dev client / internal APK / store)
app.config.js                runtimeVersion (fingerprint), updates.url, eas.projectId passthrough
package.json                 expo-updates (runtime), expo-dev-client (dev) + scripts
src/audio/sf2.ts             + runtime Documents-dir SF2 discovery (tested)
tests/audio/sf2.test.ts      + discovery cases
docs/RELEASE.md              new: how to build/install/verify + set EAS env/secrets
docs/DEVICE-VERIFICATION.md  prerequisites updated
```

`eas init` / `eas login` / `eas build` are **manual, user-driven** steps (they need
the Expo account); the repo ships the config + exact commands.

## 4. `eas.json` profiles

```jsonc
{
  "cli": { "version": ">= 16.0.0", "appVersionSource": "remote" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development",
      "environment": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "environment": "preview",
      "android": { "buildType": "apk" }
    },
    "production": {
      "channel": "production",
      "environment": "production",
      "android": { "buildType": "app-bundle" },
      "autoIncrement": true
    }
  },
  "submit": { "production": {} }
}
```

- `preview` is the **device-verification** build: an installable Android **APK**,
  internal distribution (no store), on the `preview` channel.
- `production` is present but not exercised in P2.5.
- `appVersionSource: "remote"` lets EAS own the build number.

## 5. `runtimeVersion` + `expo-updates`

- Add `expo-updates` (runtime) and, in the resolved config:
  - `runtimeVersion: { policy: "fingerprint" }` — an OTA update is only applied to
    a binary whose native fingerprint matches, so JS-only updates can never land on
    an incompatible build of a bundle with native modules (`expo-audio` AudioStream,
    `react-native-webview`).
  - `updates: { url: "https://u.expo.dev/<projectId>", fallbackToCacheTimeout: 0 }`.
  - `extra.eas.projectId` — filled by `eas init` (placeholder documented until then).
- Channels: `development` / `preview` / `production`, matched by the profiles above.
- A `fingerprint` runtimeVersion requires the project to be an EAS project; until
  `eas init` runs, the `updates.url`/`projectId` are documented placeholders.

## 6. Library keys via EAS environment variable

`app.config.js` already reads `process.env.HUMMYNA_LIBRARY_KEYS` and puts it in
`expo.extra.hummynaLibraryKeys`. EAS Build injects env at build time — a build
profile must set `"environment"` (§4) for those variables to apply:
- Create an EAS **environment variable** `HUMMYNA_LIBRARY_KEYS` for the `preview`
  (and later `production`) environment:
  `eas env:set --name HUMMYNA_LIBRARY_KEYS --value "<json>" --environment preview --visibility sensitive`.
  Use `sensitive` (obfuscated in build logs, readable in the CLI): the value is
  embedded in the app bundle, so it is not a true secret — the community key is
  deliberately public (not DRM).
- Nothing secret is committed; a build without it surfaces the app's existing
  "keys are not configured" error at import time (not at build time).

## 7. Runtime SoundFont source (`src/audio/sf2.ts`)

Today the provider resolves a configured source (`{kind:"asset"}` |
`{kind:"file"}`) or throws. Add a **runtime discovery** fallback so a device can be
used without a build-time path:

```ts
export interface SoundFontDiscovery {
  listDocuments(): Promise<{ name: string; uri: string }[]>; // expo-file-system Directory.list()
  readFile(uri: string): Promise<Uint8Array>;
}

/** First `.sf2`/`.sf3` in the app Documents dir, if any. */
export async function findSoundFontInDocuments(
  discovery: SoundFontDiscovery,
): Promise<SoundFontSource | null>;

/** Bytes for playback: configured source, else a Documents-dir `.sf2`, else throw. */
export function soundFontBytes(): Promise<Uint8Array>;
```

- `soundFontBytes()` order: configured source → Documents-dir discovery → throw the
  friendly "no SoundFont configured" error.
- `findSoundFontInDocuments` is pure over the injected `SoundFontDiscovery` and
  **unit-tested** (name filtering, ordering, none-found).
- The operator drops `gm.sf2` (or any `.sf2`/`.sf3`) into the app's Documents
  folder (visible via Files on iOS / the app dir on Android) before a session.

## 8. Docs

- **`docs/RELEASE.md`** (new): prerequisites (Expo account, `eas login`,
  `eas init`), the EAS env/secret for the key, the two build commands
  (`eas build --profile preview --platform android`, and the `development` dev
  client), install + run `DEVICE-VERIFICATION.md`, and how OTA works
  (`eas update --channel preview`).
- **`docs/DEVICE-VERIFICATION.md`**: replace "Expo Go / dev build" prereqs with
  "install the `preview` APK" and note the runtime `.sf2` drop + key setup.

## 9. Testing

- Unit (jest): `findSoundFontInDocuments` (filters `.sf2`/`.sf3`, prefers a stable
  order, returns null when none) and `soundFontBytes()` precedence (configured
  wins; Documents used otherwise; throws when neither).
- Config: `eas.json` parses; `npm run lint`/`npm test` stay green.
- **Manual/remote:** `eas build` (needs login + project), APK install, the device
  verification itself.

## 10. New dependencies

`expo-updates` (runtime). `expo-dev-client` (dev, for the `development` profile).
(No `packages/hmp` deps.)

## 11. Risks / open items

- **EAS project + login** are external; the build cannot run headlessly. The repo
  ships config + commands; `eas init` fills `projectId`.
- **Fingerprint runtimeVersion** requires an EAS project; until init, the config is
  documented but not exercised.
- **Android credentials** are EAS-managed (or a keystore) — handled on first build.
- **No device verification yet** and no operator SF2/keys: the internal APK is the
  vehicle to do that verification, not proof it passed.
- **Icons/splash** remain Expo defaults — flag before any store submission.

## 12. Deferred (YAGNI)

Play/internal submission, iOS build, EAS Workflows / CI builds, app icons & splash,
per-device keys, `packages/hmp` publishing.
