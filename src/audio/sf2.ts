import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { File } from "expo-file-system";

export type SoundFontSource = { kind: "asset"; module: number } | { kind: "file"; uri: string };

export interface SoundFontLoaders {
  readAsset(moduleId: number): Promise<Uint8Array>;
  readFile(uri: string): Promise<Uint8Array>;
}

/** Resolves the configured SoundFont to bytes, or throws a friendly error. */
export async function resolveSoundFont(
  source: SoundFontSource | null,
  loaders: SoundFontLoaders,
): Promise<Uint8Array> {
  if (!source) {
    throw new Error("HumMyna: no SoundFont configured (set expo.extra.soundFont)");
  }
  return source.kind === "asset" ? loaders.readAsset(source.module) : loaders.readFile(source.uri);
}

export function configuredSoundFont(): SoundFontSource | null {
  const extra = Constants.expoConfig?.extra as { soundFont?: SoundFontSource } | undefined;
  return extra?.soundFont ?? null;
}

const realLoaders: SoundFontLoaders = {
  async readAsset(moduleId: number): Promise<Uint8Array> {
    const asset = Asset.fromModule(moduleId);
    await asset.downloadAsync();
    const localUri = asset.localUri ?? asset.uri;
    return new File(localUri).bytes();
  },
  async readFile(uri: string): Promise<Uint8Array> {
    return new File(uri).bytes();
  },
};

/** The single swap-in point for the operator's license-clear `.sf2`. */
export function soundFontBytes(): Promise<Uint8Array> {
  return resolveSoundFont(configuredSoundFont(), realLoaders);
}
