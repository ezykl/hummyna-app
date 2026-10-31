import type { ByteSource, CryptoAdapter, InflateAdapter, LibraryKeys } from "@hummyna/hmp";
import { openHmp } from "@hummyna/hmp";
import type { LibraryStore, NewSong } from "./store";

export interface DisposableSource extends ByteSource {
  close?(): void;
}

export interface ImportDeps {
  /** Resolves a readable random-access source for a library URI (Task 4 wires this to expo-file-system). */
  sourceFor(uri: string): Promise<DisposableSource>;
  keys: LibraryKeys;
  store: LibraryStore;
  crypto?: CryptoAdapter;
  inflate?: InflateAdapter;
}

export interface ImportResult {
  libraryId: number;
  songCount: number;
}

function friendly(name: string, err: unknown): Error {
  const detail = err instanceof Error ? err.message : String(err);
  return new Error(`HmpImport: could not import "${name}" — ${detail}`);
}

/**
 * Opens a `.hmp` at `uri` and indexes its songs into the store. The file bytes
 * are never copied into the database — only `{number,title,singer,offset,length}`.
 * A corrupt/foreign file throws before anything is written.
 */
export async function importLibrary(
  uri: string,
  name: string,
  deps: ImportDeps,
): Promise<ImportResult> {
  const source = await deps.sourceFor(uri);

  let songs: NewSong[];
  try {
    const lib = await openHmp(source, deps.keys, { crypto: deps.crypto, inflate: deps.inflate });
    if (!(await lib.verify())) {
      throw new Error("index signature invalid (file corrupt or tampered)");
    }
    songs = lib.songs().map((s) => ({
      number: s.number,
      title: s.title,
      singer: s.singer,
      offset: s.offset,
      length: s.length,
    }));
  } catch (err) {
    throw friendly(name, err);
  } finally {
    // All needed bytes (footer, index, key block) are read during open/verify.
    source.close?.();
  }

  return deps.store.addLibrary({ name, path: uri }, songs);
}
