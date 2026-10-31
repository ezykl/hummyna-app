const appJson = require("./app.json");

// The shared community library key is injected at build time so no secret is
// committed. Set HUMMYNA_LIBRARY_KEYS to the JSON of `{ wrapPrivateJwk, signPublicJwk }`.
const raw = process.env.HUMMYNA_LIBRARY_KEYS;
const extra = { ...(appJson.expo.extra ?? {}) };
if (raw) {
  try {
    extra.hummynaLibraryKeys = JSON.parse(raw);
  } catch {
    throw new Error("HUMMYNA_LIBRARY_KEYS must be JSON of { wrapPrivateJwk, signPublicJwk }");
  }
}

module.exports = {
  ...appJson.expo,
  extra,
};
