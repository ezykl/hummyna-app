import { File } from "expo-file-system";
import type { LibraryStore } from "./store";

export interface LibraryUsage {
  libraries: number;
  songs: number;
  bytes: number;
}

const UNITS = ["B", "KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

/** Reads a file's size; returns 0 when the file is missing or unreadable (e.g. SAF). */
export async function sizeOfFile(uri: string): Promise<number> {
  try {
    return new File(uri).size;
  } catch {
    return 0;
  }
}

export async function libraryUsage(
  store: LibraryStore,
  sizeOf: (uri: string) => Promise<number> = sizeOfFile,
): Promise<LibraryUsage> {
  const libraries = await store.listLibraries();
  let bytes = 0;
  for (const library of libraries) {
    try {
      bytes += await sizeOf(library.path);
    } catch {
      // unreadable/missing file — report what we can
    }
  }
  const songs = libraries.reduce((n, library) => n + library.songCount, 0);
  return { libraries: libraries.length, songs, bytes };
}

/** Deletes a library's file (only used for files the app owns, e.g. iOS Documents). */
export async function deleteLibraryFile(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // best-effort; rows are removed by store.deleteLibrary regardless
  }
}
