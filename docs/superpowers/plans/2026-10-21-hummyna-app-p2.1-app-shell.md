# HumMyna App — P2.1 App Shell + Import/Browse — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Expo app shell, wire the P2.0 reader to it through React-Native platform adapters, and let a user point the app at a folder of `.hmp` files, import them (index into SQLite), browse and search songs. No playback yet.

**Architecture:** The repo becomes an Expo (Expo Router) app at its root; `packages/hmp` stays the workspace reader. RN-specific `CryptoAdapter`/`InflateAdapter` implementations and a `ByteSource` over `expo-file-system` satisfy the reader's seams. Song metadata (path + number/title/singer/offset/length) is indexed into `expo-sqlite`; the big `.hmp` bytes are never copied into the DB (Android reads in place via SAF; iOS via the Files-visible Documents folder).

**Tech Stack:** Expo SDK (latest stable) + React Native + TypeScript · Expo Router · expo-sqlite · expo-file-system · expo-document-picker · jest-expo · the existing `@hummina/hmp` package.

**Spec:** `docs/superpowers/specs/2026-10-21-hummyna-app-phase2-design.md` (§6)
**Lessons from P2.0:** the reader is random-access over `ByteSource` with `CryptoAdapter`/`InflateAdapter` seams (`packages/hmp/src/*`).

## Global Constraints

- **No new runtime deps in `packages/hmp`.** RN adapters live in the app, not the package.
- **Never copy the whole `.hmp` into memory** — read via `ByteSource` ranges; never store file bytes in SQLite.
- **Android-first**, iOS parity later. Device-only behaviours (SAF folder grant, Files-visible Documents dir) are **device-verified**, not jsdom/jest-verified.
- **Crypto on RN is a spike** (Task 1). The reader needs RSA-OAEP-SHA256 unwrap, AES-256-GCM decrypt, ECDSA-P256 (P1363) verify — **browsing the index only needs unwrap + verify** (no inflate); inflate is needed later for playback.
- **Permissionss:** Android SAF persists a folder grant; iOS uses `UIFileSharingEnabled` + `LSSupportsOpeningDocumentsInPlace` so the app's Documents folder is visible in Files.
- Gate every task: `npm run lint` + the relevant test command green. Commits with explicit paths. `main` is the default branch (no auto-deploy in this repo).

---

### Task 1: Spike — React-Native crypto strategy → `rnCryptoAdapter`

**Decision to make:** implement the reader's `CryptoAdapter` on RN. Candidates: (a) **`react-native-quick-crypto`** (native JSI; check it exposes `subtle.unwrapKey`/`decrypt`/`verify`), (b) **`@peculiar/webcrypto`** (pure-JS WebCrypto, MIT), (c) **pure-JS primitives**: `node-forge` (RSA-OAEP, BSD-3-Clause) + `@noble/ciphers` (AES-GCM, MIT) + `@noble/curves` (ECDSA P-256, MIT).

**Files:**
- Create: `src/platform/rn-crypto.ts` (or `apps/…` per the chosen layout from Task 2 — do this task AFTER Task 2 if the layout is undecided)
- Test: `tests/platform/rn-crypto.test.ts`

**Interfaces:**
- Produces: `rnCryptoAdapter: CryptoAdapter` (same shape as `webCryptoAdapter`).

- [ ] **Step 1: Try each candidate against a tiny probe** in a scratch test (import keys from `packages/hmp/tests/fixtures/keys.jwk`, unwrap the golden key block, verify the golden index signature). Record which candidate produces correct results.
- [ ] **Step 2: Implement `rnCryptoAdapter`** using the candidate that (i) is MIT/BSD-permissive, (ii) supports all three ops, (iii) is practical on RN. Wrap it to the `CryptoAdapter` interface exactly:

```ts
import type { CryptoAdapter } from "@hummina/hmp";
export const rnCryptoAdapter: CryptoAdapter = { /* importWrapPrivate, importSignPublic, unwrapKey, decrypt, verifyIndex */ };
```

- [ ] **Step 3: Contract test** (Node-runnable): open the golden `.hmp` with `openHmp(memoryByteSource(fixture), keys, { crypto: rnCryptoAdapter })` and assert `verify()` is true and `songs().length === 3`. This must pass in Node without a device.
- [ ] **Step 4: Commit** `feat(app): react-native crypto adapter for the hmp reader`

---

### Task 2: Scaffold the Expo app (monorepo)

**Files:**
- Modify: `package.json` (root → Expo app + workspaces), `tsconfig.json`, `app.json`, `metro.config.js`, `babel.config.js`, `.gitignore`
- Create: `app/_layout.tsx`, `app/index.tsx`, `jest.config.js`, `tests/app/smoke.test.ts`

**Interfaces:** root project is a runnable Expo app that resolves `@hummina/hmp` from the workspace.

- [ ] **Step 1: Scaffold** with `npx create-expo-app@latest . --template blank-typescript` (into the existing repo; keep `packages/hmp`, `docs/`), then add Expo Router (`npx expo install expo-router react-native-safe-area-context react-native-screens expo-linking expo-constants expo-status-bar`).
- [ ] **Step 2: Monorepo config** — `metro.config.js` with `watchFolders: [workspaceRoot]` + `resolver.nodeModulesPaths`; ensure `packages/hmp` resolves as `@hummina/hmp` (add `"@hummina/hmp": "*"` to the app's deps and a `tsconfig` path or rely on workspaces).
- [ ] **Step 3: Identifiers** — `app.json`: name `HumMyna`, slug `hummina`, `scheme` `hummina`, android package `app.hummina`, ios bundle id `app.hummina`, plus iOS `infoPlist: { UIFileSharingEnabled: true, LSSupportsOpeningDocumentsInPlace: true }`.
- [ ] **Step 4: jest-expo** — add `jest-expo`, a `test` script, and a smoke test rendering the root screen.
- [ ] **Step 5: Gate + commit** `chore(app): scaffold Expo app shell (monorepo)`

---

### Task 3: RN inflate adapter (`fflate`)

**Files:** Create `src/platform/rn-inflate.ts`; Test `tests/platform/rn-inflate.test.ts`

**Interfaces:** Produces `rnInflateAdapter: InflateAdapter` (deflate-raw inflate via `fflate`'s `inflateSync`/`decompressSync`).

- [ ] **Step 1: Failing test** — deflate-raw a payload (via `fflate.deflateSync`), `expect(await rnInflateAdapter.rawInflate(x))` to equal it.
- [ ] **Step 2: Implement** wrapping `fflate` (MIT).
- [ ] **Step 3: Commit** `feat(app): react-native inflate adapter (fflate)`

---

### Task 4: Spike — `ByteSource` over `expo-file-system`

**Files:** Create `src/platform/file-byte-source.ts`; Test `tests/platform/file-byte-source.test.ts` (logic split so range math is unit-tested; the native read is device-verified)

**Interfaces:** Produces `fileByteSource(uri: string): Promise<ByteSource>`.

- [ ] **Step 1: Spike** — determine whether `expo-file-system` can read an arbitrary byte range of a `content://` (Android SAF) / `file://` URI. Record findings; if not, plan a tiny native module (separate task).
- [ ] **Step 2: Implement** using `expo-file-system`'s positioned read (or the legacy `readAsStringAsync` position/length, or `File`/`Directory` API), splitting pure range math (`clampRead`) into a tested helper.
- [ ] **Step 3: Contract test** — with a mocked reader, assert offset/length math + EOF clamping; document the device check.
- [ ] **Step 4: Commit** `feat(app): file-system ByteSource for reading .hmp in place`

---

### Task 5: Library store (SQLite)

**Files:** Create `src/library/db.ts`, `src/library/store.ts`; Test `tests/library/store.test.ts`

**Interfaces:**
- Produces: `openLibraryDb()`, `Library`, `Song` (`{ id, libraryId, number, title, singer, offset, length }`), `addLibrary(meta, songs)`, `listLibraries()`, `searchSongs(query, limit)`, `deleteLibrary(id)`.

- [ ] **Step 1: Failing test** (schema + search, using an in-memory sqlite via `expo-sqlite`'s test mode OR a thin adapter): create a library with 3 songs → `searchSongs("G2")` returns it; `searchSongs("S1")` returns by singer; `deleteLibrary` removes rows.
- [ ] **Step 2: Implement** the schema (`libraries`, `songs`, FTS or indexed columns) + functions.
- [ ] **Step 3: Commit** `feat(app): sqlite library store with search`

---

### Task 6: Import flow

**Files:** Create `src/library/import.ts`; Test `tests/library/import.test.ts`

**Interfaces:**
- Consumes: `openHmp`, `fileByteSource`, `Library` (Task 5).
- Produces: `importLibrary(uri, name, deps): Promise<{ libraryId: number; songCount: number }>`.

- [ ] **Step 1: Failing test** (with a fake ByteSource + fake crypto adapter + fake store): importing the golden `.hmp` writes 3 song rows + one library row; a corrupt file rejects with a friendly error and writes nothing.
- [ ] **Step 2: Implement** — `openHmp(fileByteSource(uri), keys)`, read `songs()`, `addLibrary`.
- [ ] **Step 3: Commit** `feat(app): import .hmp into the library store`

---

### Task 7: Folder access + picker

**Files:** Create `src/platform/pick-library.ts`; Modify `app.json` (iOS infoPlist already in Task 2)

**Interfaces:** Produces `pickHmpFiles(): Promise<{ uri: string; name: string }[]>` (Android SAF via `StorageAccessFramework`/document picker; iOS via Documents dir listing or the document picker).

- [ ] **Step 1: Implement** Android: `expo-file-system` `StorageAccessFramework.requestDirectoryPermissionsAsync()` + read `.hmp` entries (persist the grant). iOS: list/import from the app Documents folder (`UIFileSharingEnabled`) and/or `expo-document-picker`.
- [ ] **Step 2: Device verify** (manual): grant a folder, see the `.hmp` files.
- [ ] **Step 3: Commit** `feat(app): platform folder/file pickers`

---

### Task 8: Browse/search screens (Expo Router)

**Files:** Create `app/(tabs)/_layout.tsx` (or stack), `app/libraries.tsx` (or `app/index.tsx`), `app/library/[id].tsx`; Test `tests/ui/browse.test.tsx`

**Interfaces:** Produces screens listing libraries and searching songs (title/number/singer).

- [ ] **Step 1: Failing render test** (jest-expo + @testing-library/react-native): renders a library's songs and filters by a query.
- [ ] **Step 2: Implement** the screens against `src/library/store` (list + search box + results).
- [ ] **Step 3: Commit** `feat(app): libraries and song-search screens`

---

### Task 9: App CI + storage management

**Files:** Create `.github/workflows/ci.yml`, `src/library/storage.ts`; Test `tests/library/storage.test.ts`

- [ ] **Step 1: Storage** — `libraryUsage()` (counts + sizes via `expo-file-system`) + `deleteLibrary` wiring; unit test the formatting math.
- [ ] **Step 2: CI** — GitHub Actions: Node 22, `npm ci`, `npm run lint`, unit tests (jest). (Device/expo prebuild not in CI.)
- [ ] **Step 3: Commit** `chore(app): CI and storage management`

---

## Self-Review

**Spec coverage:** §6 (SAF/Files folder, import → SQLite, FTS search, storage mgmt) → Tasks 4-9; reader wiring + RN adapters (§4/§5 seams) → Tasks 1-4. Playback/recording/scoring are later sub-projects.
**Placeholder scan:** no TBD; each task lists concrete files + the command or code shape. Two tasks are explicitly **spikes** (crypto strategy, ByteSource ranged reads) with a named decision procedure and a Node-testable deliverable — not vague.
**Type consistency:** `CryptoAdapter`/`InflateAdapter`/`ByteSource` come from `@hummina/hmp` (P2.0); `Library`/`Song`/`importLibrary`/`pickHmpFiles` named once (Tasks 5-7) and consumed in Tasks 7-9.
**Robustness:** browsing needs only unwrap+verify (no inflate), so P2.1 is usable before playback lands.
**Device-only items** (SAF grant, Files-visible Documents dir, real ranged reads) are called out as manual verification.
