import type { LibraryKeys } from "@hummyna/hmp";
import Constants from "expo-constants";

interface Extra {
  hummynaLibraryKeys?: LibraryKeys;
}

/**
 * The shared community library key (wrap-private + sign-public), supplied at
 * build time via `expo.extra.hummynaLibraryKeys` in `app.config.js`. Kept out of
 * source so no secret is committed; the format is community-level, not DRM.
 */
export function libraryKeys(): LibraryKeys {
  const keys = (Constants.expoConfig?.extra as Extra | undefined)?.hummynaLibraryKeys;
  if (!keys) {
    throw new Error(
      "HumMyna: library keys are not configured (set expo.extra.hummynaLibraryKeys)",
    );
  }
  return keys;
}
