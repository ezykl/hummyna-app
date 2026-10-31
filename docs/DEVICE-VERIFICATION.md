# Device Verification — HumMyna App

Manual checks for behaviours that **cannot** be verified headlessly (jsdom/jest).
Run on a real Android device first, then iOS. Re-run the relevant section after
touching file-system, picker, SQLite, or crypto code.

Latest status: **P2.1 — pending**

## Prerequisites

- [ ] Dependencies installed: `npm install`
- [ ] A dev build or Expo Go (P2.1 modules — `expo-file-system`, `expo-sqlite`,
      `expo-router` — are Expo-Go compatible; later native audio needs a dev client).
- [ ] **Library keys** available (the operator's `{ wrapPrivateJwk, signPublicJwk }`).
      Inject at build/start time; never commit them:
      ```powershell
      $env:HUMMYNA_LIBRARY_KEYS = '{"wrapPrivateJwk":{...},"signPublicJwk":{...}}'
      npm run start
      ```
      `app.config.js` copies this into `expo.extra.hummynaLibraryKeys`.
      Without it, import shows **"Import failed — … library keys are not configured"**.
- [ ] At least one real `.hmp` file (a small library) on the device.
- [ ] Baseline (optional but recommended): `npm test` + `npm run lint` green.

## Android (primary)

### SAF folder grant + import
- [ ] Tap **Import library** → a folder picker appears.
- [ ] Grant access to a folder containing `.hmp` files.
- [ ] The library appears in the list with the correct song count.
- [ ] Re-launch the app; the imported library is still listed (SQLite persisted).

### Ranged reads over `content://` (the P2.1 spike)
- [ ] Import succeeds without copying the whole file (watch memory / app size).
- [ ] No `FileHandle`-related crash; the file descriptor is released after import
      (import repeatedly — no "too many open files" / file-locked errors).
- [ ] Opening a large library (hundreds of MB) does not freeze or OOM.

### Browse / search
- [ ] Tap a library → its songs list (and **only** its songs).
- [ ] Search by title, by number, and by singer returns the right rows.
- [ ] A query of `%` or `_` returns nothing (metacharacters treated literally).

### Storage + delete
- [ ] The libraries screen shows a summary: `N libraries · M songs · X`.
- [ ] Long-press a library → confirm → it disappears and rows are removed.

### Crypto on Hermes
- [ ] Importing a valid `.hmp` reports success (i.e. `verify()` returned true on
      device, not just under Node). `@peculiar/webcrypto` must work on Hermes.
- [ ] Importing a corrupt/tampered file fails with a friendly message and writes
      **no** rows.

## iOS

### Files-visible Documents folder
- [ ] `UIFileSharingEnabled` / `LSSupportsOpeningDocumentsInPlace` are active:
      the app's Documents folder is visible under **Files → On My iPhone → HumMyna**.
- [ ] Drop a `.hmp` into that folder.
- [ ] Tap **Import library** → the `.hmp` is found and imported.
- [ ] Browse + search behave as on Android.

## Known limitations / follow-ups

- Android folder listing is **single-level** (nested `.hmp` are not scanned); the
  SAF grant is not persisted across restarts; no document-picker fallback when the
  grant is denied.
- Search uses indexed `LIKE` columns, not FTS5.
- Re-importing the same file inserts duplicate rows (no dedupe yet).
- File sizes for `content://` URIs may read as `0` (SAF).

## Reporting

When a check fails, capture: platform + OS version, app build, the exact steps,
the on-screen error, and (Android) `adb logcat` / (iOS) the Xcode console output.
