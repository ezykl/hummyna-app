import { Asset } from "expo-asset";
import Constants from "expo-constants";
import { Directory, File, Paths } from "expo-file-system";

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
  if (candidate?.kind === "file") return loaders.readFile(candidate.uri);
  throw new Error(
    "HumMyna: no SoundFont configured (set expo.extra.soundFont or place an .sf2 in the app Documents folder)",
  );
}

/** The single swap-in point for the operator's license-clear `.sf2`. */
export function soundFontBytes(): Promise<Uint8Array> {
  return resolveSoundFontBytes(configuredSoundFont(), realDiscovery, realLoaders);
}
