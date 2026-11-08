# HumMyna App — P2.5 Release Tooling + Internal Build — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the EAS build/OTA configuration and a runtime SoundFont fallback so the app can be built as an internal Android APK and device-verified end-to-end.

**Architecture:** `eas.json` defines dev-client / internal-APK / store profiles; `expo-updates` with a `fingerprint` runtimeVersion gives safe OTA; library keys are injected via an EAS environment variable (never committed). `src/audio/sf2.ts` gains a tested runtime discovery so the operator drops a `.sf2` into the app Documents folder on device.

**Tech Stack:** Expo SDK 58 · `expo-updates` · `expo-dev-client` · EAS CLI (`eas build`) · jest-expo.

**Spec:** `docs/superpowers/specs/2026-11-05-hummyna-app-p2.5-release-design.md`

## Global Constraints

- **No secrets or licensed assets committed** — library keys come from an EAS environment variable; no `.sf2` is committed.
- **Existing seams preserved** — `SoundFontSource`/`configuredSoundFont()`/`resolveSoundFont()` keep working; discovery is an added fallback.
- `runtimeVersion` uses the **fingerprint** policy; channels `development`/`preview`/`production`.
- `eas init` / `eas login` / `eas build` are **manual, user-run** steps (documented, not automated here).
- Gate every task: `npm run lint` + `npm test` green; `eas.json` must be valid JSON. Commits with explicit paths. `main` is the default branch.

---

### Task 1: Runtime SoundFont discovery (`src/audio/sf2.ts`)

**Files:**
- Modify: `src/audio/sf2.ts`
- Test: `tests/audio/sf2.test.ts`

**Interfaces:**
- Produces: `SoundFontDiscovery { listDocuments(): Promise<{ name; uri }[]> }`, `findSoundFontInDocuments(discovery): Promise<SoundFontSource | null>`, `resolveSoundFontBytes(configured, discovery, loaders): Promise<Uint8Array>`; `soundFontBytes()` now falls back to Documents.
- Consumes: existing `SoundFontSource`, `SoundFontLoaders`, `resolveSoundFont`, `configuredSoundFont`.

- [ ] **Step 1: Write the failing test** (append to `tests/audio/sf2.test.ts`)

```ts
import type { SoundFontDiscovery, SoundFontLoaders } from "../../src/audio/sf2";
import { findSoundFontInDocuments, resolveSoundFontBytes } from "../../src/audio/sf2";

const bytesLoaders: SoundFontLoaders = {
  readAsset: jest.fn(async () => new Uint8Array([1])),
  readFile: jest.fn(async () => new Uint8Array([2])),
};
const discovery = (names: string[]): SoundFontDiscovery => ({
  listDocuments: jest.fn(async () => names.map((name) => ({ name, uri: `file:///doc/${name}` }))),
});

describe("findSoundFontInDocuments", () => {
  it("picks the first .sf2/.sf3 alphabetically", async () => {
    const found = await findSoundFontInDocuments(discovery(["zzz.sf2", "aaa.sf3", "notes.txt"]));
    expect(found).toEqual({ kind: "file", uri: "file:///doc/aaa.sf3" });
  });

  it("returns null when none match", async () => {
    expect(await findSoundFontInDocuments(discovery(["a.txt", "b.mid"]))).toBeNull();
  });
});

describe("resolveSoundFontBytes", () => {
  it("prefers the configured source", async () => {
    const bytes = await resolveSoundFontBytes({ kind: "asset", module: 5 }, discovery([]), bytesLoaders);
    expect(Array.from(bytes)).toEqual([1]);
    expect(bytesLoaders.readAsset).toHaveBeenCalledWith(5);
  });

  it("falls back to a Documents .sf2", async () => {
    const bytes = await resolveSoundFontBytes(null, discovery(["gm.sf2"]), bytesLoaders);
    expect(Array.from(bytes)).toEqual([2]);
    expect(bytesLoaders.readFile).toHaveBeenCalledWith("file:///doc/gm.sf2");
  });

  it("throws a friendly error when nothing is available", async () => {
    await expect(resolveSoundFontBytes(null, discovery([]), bytesLoaders)).rejects.toThrow(/SoundFont/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/audio/sf2.test.ts`
Expected: FAIL — `findSoundFontInDocuments`/`resolveSoundFontBytes` not exported.

- [ ] **Step 3: Implement in `src/audio/sf2.ts`**

Add `Directory`/`Paths` to the expo-file-system import (keep `File`), then add:

```ts
export interface SoundFontDiscovery {
  listDocuments(): Promise<{ name: string; uri: string }[]>;
}

/** First `.sf2`/`.sf3` (alphabetical) in the app Documents dir, or null. */
export async function findSoundFontInDocuments(discovery: SoundFontDiscovery): Promise<SoundFontSource | null> {
  const files = await discovery.listDocuments();
  const candidates = files
    .filter((f) => /\.(sf2|sf3)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  return candidates.length > 0 ? { kind: "file", uri: candidates[0].uri } : null;
}

const realDiscovery: SoundFontDiscovery = {
  async listDocuments() {
    const dir = new Directory(Paths.document);
    if (!dir.exists) return [];
    return dir.list().map((entry) => ({ name: entry.name, uri: entry.uri }));
  },
};

/** Configured source wins; else a Documents `.sf2`; else a friendly error. */
export async function resolveSoundFontBytes(
  configured: SoundFontSource | null,
  discovery: SoundFontDiscovery,
  loaders: SoundFontLoaders,
): Promise<Uint8Array> {
  if (configured) return resolveSoundFont(configured, loaders);
  const candidate = await findSoundFontInDocuments(discovery);
  if (candidate) return loaders.readFile(candidate.uri);
  throw new Error(
    "HumMyna: no SoundFont configured (set expo.extra.soundFont or place an .sf2 in the app Documents folder)",
  );
}
```

Replace the existing `soundFontBytes` with:

```ts
/** The single swap-in point for the operator's license-clear `.sf2`. */
export function soundFontBytes(): Promise<Uint8Array> {
  return resolveSoundFontBytes(configuredSoundFont(), realDiscovery, realLoaders);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest tests/audio/sf2.test.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/audio/sf2.ts tests/audio/sf2.test.ts
git commit -m "feat(app): runtime SoundFont discovery in app Documents"
```

---

### Task 2: `expo-updates` + fingerprint runtimeVersion + OTA config

**Files:**
- Modify: `package.json`, `app.config.js`

**Interfaces:**
- Produces: `expo.runtimeVersion = { policy: "fingerprint" }`, conditional `expo.updates.url`, and `expo.extra.eas.projectId` from `EXPO_PROJECT_ID`.

- [ ] **Step 1: Install**

```bash
npx expo install expo-updates expo-dev-client
```

- [ ] **Step 2: Rewrite `app.config.js`**

```js
const appJson = require("./app.json");
const extra = { ...(appJson.expo.extra ?? {}) };

// Shared community library key, injected at build time (EAS env). Never commit it.
const rawKeys = process.env.HUMMYNA_LIBRARY_KEYS;
if (rawKeys) {
  try {
    extra.hummynaLibraryKeys = JSON.parse(rawKeys);
  } catch {
    throw new Error("HUMMYNA_LIBRARY_KEYS must be JSON of { wrapPrivateJwk, signPublicJwk }");
  }
}

// A device file:// URI for the operator's license-clear GM SoundFont (optional;
// otherwise the app looks for an .sf2 dropped into its Documents folder).
const sf2Uri = process.env.HUMMYNA_SOUNDFONT;
if (sf2Uri) {
  extra.soundFont = { kind: "file", uri: sf2Uri };
}

// EAS project id (set by `eas init`, or via EXPO_PROJECT_ID). Enables OTA.
const projectId = process.env.EXPO_PROJECT_ID;
extra.eas = { ...(extra.eas ?? {}) };
if (projectId) extra.eas.projectId = projectId;

module.exports = {
  ...appJson.expo,
  // Fingerprint policy: an OTA update only applies to a binary with a matching
  // native fingerprint (safe for a bundle with native modules).
  runtimeVersion: { policy: "fingerprint" },
  ...(projectId
    ? { updates: { url: `https://u.expo.dev/${projectId}`, fallbackToCacheTimeout: 0 } }
    : {}),
  extra,
};
```

- [ ] **Step 3: Verify config resolves and the gate is green**

Run: `npx expo config --type public` (should print the config without error; `runtimeVersion` present, `updates` absent until `EXPO_PROJECT_ID` is set)
Then: `npm run lint` (clean) + `npm test` (all pass).

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json app.config.js
git commit -m "feat(app): expo-updates + fingerprint runtimeVersion + OTA config"
```

---

### Task 3: `eas.json`

**Files:**
- Create: `eas.json`

**Interfaces:**
- Produces: build profiles `development` (dev client), `preview` (internal Android APK), `production` (store); a `submit.production` placeholder.

- [ ] **Step 1: Create `eas.json`**

```json
{
  "cli": {
    "version": ">= 16.0.0",
    "appVersionSource": "remote"
  },
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
  "submit": {
    "production": {
      "android": { "track": "internal" }
    }
  }
}
```

- [ ] **Step 2: Validate JSON + gate**

Run: `node -e "JSON.parse(require('fs').readFileSync('eas.json','utf8')); console.log('eas.json ok')"`
Then: `npm run lint` + `npm test` (green).

- [ ] **Step 3: Commit**

```bash
git add eas.json
git commit -m "chore(app): eas.json build profiles (dev client / internal APK / store)"
```

---

### Task 4: Release docs

**Files:**
- Create: `docs/RELEASE.md`
- Modify: `docs/DEVICE-VERIFICATION.md`

- [ ] **Step 1: Create `docs/RELEASE.md`**

```markdown
# Release & Internal Builds

Tooling is in `eas.json`. `eas build`/`eas update` run remotely and require an
Expo account; the key secret and the SoundFont are **not** committed.

## One-time setup

```bash
npm install
npx eas login
npx eas init                 # links the project, writes extra.eas.projectId
# Library key (never commit it) — set for the preview environment:
npx eas env:set --name HUMMYNA_LIBRARY_KEYS --value "<json {wrapPrivateJwk,signPublicJwk}>" --environment preview --visibility sensitive
# (repeat with --environment production before a store release)
```

## Build an internal Android APK (device verification)

```bash
npx eas build --profile preview --platform android
```
Install the APK from the printed link, then work through
`docs/DEVICE-VERIFICATION.md`. Drop a license-clear `gm.sf2` (or `.sf3`) into the
app's Documents folder first (Files on iOS; the app dir on Android) so playback
has a SoundFont — or set `expo.extra.soundFont` via `HUMMYNA_SOUNDFONT`.

## Development build (dev client, iterate with Metro)

```bash
npx eas build --profile development --platform android
npx expo start --dev-client
```

## OTA updates (JS-only changes)

`runtimeVersion` uses the **fingerprint** policy: an update only applies to a
binary whose native fingerprint matches. Publish a JS-only fix with:

```bash
npx eas update --channel preview --environment preview --message "fix: ..."
```
Native changes (new native module, SDK bump, config-plugin/permission change)
require a **new build**; OTA cannot deliver them.
```

- [ ] **Step 2: Update `docs/DEVICE-VERIFICATION.md` prerequisites**

Replace the "dev build or Expo Go" prerequisite bullet with install-the-preview-APK guidance and add the runtime `.sf2` + key setup note (referencing `docs/RELEASE.md`).

- [ ] **Step 3: Gate + commit**

Run: `npm run scrub` (clean) then commit:

```bash
git add docs/RELEASE.md docs/DEVICE-VERIFICATION.md
git commit -m "docs: EAS build/OTA runbook + device-verification prerequisites"
```

---

## Self-Review

**Spec coverage:** §4 eas.json -> Task 3; §5 runtimeVersion/updates -> Task 2; §6 keys via EAS env -> Task 2 (config) + Task 4 (runbook); §7 runtime SoundFont discovery -> Task 1; §8 docs -> Task 4; §9 testing -> Task 1 (unit); §10 deps -> Task 2; §11 risks -> Task 4 (manual steps documented).

**Placeholder scan:** the only external unknown is the EAS `projectId`, filled by `eas init` / `EXPO_PROJECT_ID` and consumed conditionally (no hardcoded placeholder string); `updates` is simply omitted until it exists. No TBD/TODO stubs.

**Type consistency:** `SoundFontDiscovery`/`findSoundFontInDocuments`/`resolveSoundFontBytes` defined and used in Task 1 only; `soundFontBytes()` keeps its signature (used by the P2.2/P2.3 routes unchanged); `app.config.js` keys `HUMMYNA_LIBRARY_KEYS`/`HUMMYNA_SOUNDFONT` unchanged, adds `EXPO_PROJECT_ID`.

