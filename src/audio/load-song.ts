import type { SongRef } from "@hummyna/hmp";
import { openHmp } from "@hummyna/hmp";
import { openLibraryDb } from "../library/db";
import type { Library } from "../library/store";
import { libraryKeys } from "../library/keys";
import { fileByteSource } from "../platform/file-byte-source";
import { rnCryptoAdapter } from "../platform/rn-crypto";
import { rnInflateAdapter } from "../platform/rn-inflate";

export interface LoadedSong {
  library: Library;
  ref: SongRef;
  midi: Uint8Array;
}

/** Opens a song's MIDI, closing the ByteSource as soon as the bytes are read. */
export async function loadSong(libraryId: number, number: number): Promise<LoadedSong | null> {
  const store = await openLibraryDb();
  const library = await store.getLibrary(libraryId);
  if (!library) return null;
  const source = await fileByteSource(library.path);
  try {
    const hmp = await openHmp(source, libraryKeys(), {
      crypto: rnCryptoAdapter,
      inflate: rnInflateAdapter,
    });
    const ref = hmp.songs().find((s) => s.number === number);
    if (!ref) return null;
    return { library, ref, midi: await hmp.midiFor(ref) };
  } finally {
    source.close();
  }
}
