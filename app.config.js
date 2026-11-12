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
