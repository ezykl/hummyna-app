# Release & Internal Builds

Tooling is in `eas.json`. `eas build` / `eas update` run remotely and require an
Expo account. **The library key secret and the SoundFont are NOT committed.**

## One-time setup

```bash
npm install
npx eas login
npx eas init                 # links the project, writes extra.eas.projectId
# Library key (never commit it) — set for the preview environment:
npx eas env:set --name HUMMYNA_LIBRARY_KEYS --value "<json {wrapPrivateJwk,signPublicJwk}>" --environment preview --visibility sensitive
# (repeat with --environment production before a store release)
```

`app.config.js` reads `HUMMYNA_LIBRARY_KEYS` at build time. `eas.json` build
profiles set `"environment": "preview"` (etc.) so the matching variables apply.

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
require a **new build** — OTA cannot deliver them.

## Store release (later)

```bash
npx eas build --profile production --platform android   # AAB
npx eas submit --profile production --platform android  # Play internal track
```

Set `HUMMYNA_LIBRARY_KEYS` for the `production` environment first. App icons/splash
are still Expo defaults — set them before any store submission.
