# Device Verification — HumMyna App

Manual checks for behaviours that **cannot** be verified headlessly (jsdom/jest).
Run on a real Android device first, then iOS. Re-run the relevant section after
touching file-system, picker, SQLite, or crypto code.

Latest status: **P2.1–P2.5 — pending**

## Prerequisites

- [ ] **Install the internal build** — the recommended path is the `preview`
      Android APK (`npx eas build --profile preview --platform android`); see
      `docs/RELEASE.md`. For iterating, use the `development` dev-client build.
      (A dev client is required — the app uses native modules: `expo-audio`
      `AudioStream`, `react-native-webview`.)
- [ ] **Library keys** available (the operator's `{ wrapPrivateJwk, signPublicJwk }`).
      Inject at build time via the EAS environment variable (see `docs/RELEASE.md`),
      or locally:
      ```powershell
      $env:HUMMYNA_LIBRARY_KEYS = '{"wrapPrivateJwk":{...},"signPublicJwk":{...}}'
      npm run start
      ```
      `app.config.js` copies this into `expo.extra.hummynaLibraryKeys`.
      Without it, import shows **"Import failed — … library keys are not configured"**.
- [ ] **SoundFont** — drop a license-clear `gm.sf2` (or `.sf3`) into the app's
      Documents folder (Files on iOS / the app dir on Android); the app discovers it
      at runtime. (Alternatively set `HUMMYNA_SOUNDFONT` to a device `file://` URI.)
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

## P2.2 — Playback (WebView synth)

Prereq: generate the bundled synth sources (`npm run build:synth`) and point the
app at a license-clear SoundFont:
```powershell
$env:HUMMYNA_LIBRARY_KEYS = '{...}'
$env:HUMMYNA_SOUNDFONT = 'file:///path/to/gm.sf2'   # app.config.js -> expo.extra.soundFont
```
(The `{ kind: "asset" }` SoundFont source is a seam for a future bundled
`require()`; today only the `file` source is configurable.)

- [ ] Open an imported song from the library list → the player screen appears.
- [ ] With a SoundFont configured, **Play** produces audible sound.
- [ ] Play / Pause / Stop and `-10s` / `+10s` seek behave and the playhead moves.
- [ ] Lyrics highlight the current line and advance with the music.
- [ ] The screen stays awake while the player is open.
- [ ] Without a SoundFont configured, the player shows a friendly error and does
      **not** crash.
- [ ] Android: WebView audio plays with the device volume; iOS: WKWebView allows
      autoplay after the Play tap (`mediaPlaybackRequiresUserAction={false}`).
- [ ] No memory blow-up on a multi-minute MIDI; progress ticks smoothly.

## P2.3 — Recording

- [ ] First tap of **Record** prompts for microphone permission; granting it
      proceeds (denying shows an error and does not start capture).
- [ ] From a song, tap **Record** → the backing track plays **and** voice capture
      starts (sing-along).
- [ ] The input meter moves with the voice; the elapsed timer advances.
- [ ] Tap **Stop** → a take is saved and the **results** screen appears (takes remain reachable from the player's **Takes** button).
- [ ] With the mic permission denied, the recorder surfaces a permission error
      (`HumMyna: microphone permission denied`) and does **not** crash.
- [ ] iOS: recording **while** the synth plays requires a recording-capable audio
      session; verify both the backing track and the mic are captured (the iOS
      session caveat — playback may duck or route to the receiver).

## P2.4 — Scoring

- [ ] Sing a take (**Record** → **Stop**) → the **results** screen appears (not the takes list).
- [ ] The results screen shows the accuracy **%**, a letter **grade**, the
      **notes / best-streak** line, and **per-line bars**.
- [ ] **Sing again** returns to the player for the same song.
- [ ] Tapping **Fun** on the player shows the results screen with the
      **"Fun mode — not mic-based."** label (random score, no mic input used).

## Reporting

When a check fails, capture: platform + OS version, app build, the exact steps,
the on-screen error, and (Android) `adb logcat` / (iOS) the Xcode console output.
