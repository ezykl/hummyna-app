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

const SOUND_FONT_RE = /\.(sf2|sf3)$/i;
const SELECTED_RE = /^selected\.(sf2|sf3)$/i;

/** A user-selected SoundFont (copied into Documents), else the first `.sf2`/`.sf3`. */
export async function findSoundFontInDocuments(discovery: SoundFontDiscovery): Promise<SoundFontSource | null> {
  const files = await discovery.listDocuments();
  const selected = files
    .filter((f) => SELECTED_RE.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (selected.length > 0) return { kind: "file", uri: selected[0].uri };
  const candidates = files.filter((f) => SOUND_FONT_RE.test(f.name)).sort((a, b) => a.name.localeCompare(b.name));
  return candidates.length > 0 ? { kind: "file", uri: candidates[0].uri } : null;
}

const realDiscovery: SoundFontDiscovery = {
  async listDocuments() {
    const dir = new Directory(Paths.document);
    if (!dir.exists) return [];
    return dir
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .map((entry) => ({ name: entry.name, uri: entry.uri }));
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

/** Removes any previously selected SoundFont from the app Documents dir. */
export async function clearImportedSoundFont(): Promise<void> {
  const dir = new Directory(Paths.document);
  if (!dir.exists) return;
  for (const entry of dir.list()) {
    if (entry instanceof File && SELECTED_RE.test(entry.name)) entry.delete();
  }
}

/** Lets the user pick an `.sf2`/`.sf3` and copies it into Documents as the selection. */
export async function importSoundFont(): Promise<SoundFontSource | null> {
  const picked = await File.pickFileAsync({ mimeTypes: "*/*" });
  if (picked.canceled) return null;
  const source = picked.result;
  const extension = /\.sf3$/i.test(source.name) ? ".sf3" : ".sf2";
  await clearImportedSoundFont();
  const destination = new File(Paths.document, `selected${extension}`);
  await source.copy(destination);
  return { kind: "file", uri: destination.uri };
}

function safeBaseName(uri: string): string {
  const raw = uri.split("/").pop() ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** What playback will use — the build-configured source or a Documents file. */
export async function describeSoundFont(): Promise<{ name: string | null; canClear: boolean }> {
  const configured = configuredSoundFont();
  if (configured) {
    return { name: configured.kind === "file" ? safeBaseName(configured.uri) : "bundled", canClear: false };
  }
  const discovered = await findSoundFontInDocuments(realDiscovery);
  if (!discovered || discovered.kind !== "file") return { name: null, canClear: false };
  const name = safeBaseName(discovered.uri);
  return { name: name.length > 0 ? name : null, canClear: SELECTED_RE.test(name) };
}
