export type SqlValue = string | number | null | Uint8Array;

export interface SqliteRunResult {
  lastInsertRowid: number;
  changes: number;
}

/**
 * Minimal seam over SQLite so the store is testable in Node (node:sqlite) and
 * runs on device through expo-sqlite. Never store `.hmp` bytes here — only metadata.
 */
export interface SqliteAdapter {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlValue[]): Promise<SqliteRunResult>;
  all<T = unknown>(sql: string, params?: SqlValue[]): Promise<T[]>;
}

export interface Library {
  id: number;
  name: string;
  path: string;
  songCount: number;
  createdAt: number;
}

export interface Song {
  id: number;
  libraryId: number;
  number: number;
  title: string;
  singer: string;
  offset: number;
  length: number;
}

export interface NewLibrary {
  name: string;
  path: string;
}

export type NewSong = Omit<Song, "id" | "libraryId">;

export interface AddLibraryResult {
  libraryId: number;
  songCount: number;
}

export interface LibraryStore {
  addLibrary(meta: NewLibrary, songs: NewSong[]): Promise<AddLibraryResult>;
  listLibraries(): Promise<Library[]>;
  searchSongs(query: string, limit?: number): Promise<Song[]>;
  deleteLibrary(id: number): Promise<void>;
}

export const SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  song_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL REFERENCES libraries(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  singer TEXT NOT NULL,
  offset INTEGER NOT NULL,
  length INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_songs_library ON songs(library_id);
CREATE INDEX IF NOT EXISTS idx_songs_title ON songs(title);
CREATE INDEX IF NOT EXISTS idx_songs_singer ON songs(singer);
`;

interface LibraryRow {
  id: number;
  name: string;
  path: string;
  song_count: number;
  created_at: number;
}

interface SongRow {
  id: number;
  library_id: number;
  number: number;
  title: string;
  singer: string;
  offset: number;
  length: number;
}

const toLibrary = (r: LibraryRow): Library => ({
  id: r.id,
  name: r.name,
  path: r.path,
  songCount: r.song_count,
  createdAt: r.created_at,
});

const toSong = (r: SongRow): Song => ({
  id: r.id,
  libraryId: r.library_id,
  number: r.number,
  title: r.title,
  singer: r.singer,
  offset: r.offset,
  length: r.length,
});

export async function migrate(adapter: SqliteAdapter): Promise<void> {
  await adapter.exec(SCHEMA);
}

async function inTransaction<T>(adapter: SqliteAdapter, fn: () => Promise<T>): Promise<T> {
  await adapter.exec("BEGIN");
  try {
    const result = await fn();
    await adapter.exec("COMMIT");
    return result;
  } catch (err) {
    await adapter.exec("ROLLBACK");
    throw err;
  }
}

export function createLibraryStore(adapter: SqliteAdapter): LibraryStore {
  return {
    async addLibrary(meta: NewLibrary, songs: NewSong[]): Promise<AddLibraryResult> {
      return inTransaction(adapter, async () => {
        const { lastInsertRowid: libraryId } = await adapter.run(
          "INSERT INTO libraries (name, path, song_count, created_at) VALUES (?, ?, ?, ?)",
          [meta.name, meta.path, songs.length, Date.now()],
        );
        for (const s of songs) {
          await adapter.run(
            "INSERT INTO songs (library_id, number, title, singer, offset, length) VALUES (?, ?, ?, ?, ?, ?)",
            [libraryId, s.number, s.title, s.singer, s.offset, s.length],
          );
        }
        return { libraryId, songCount: songs.length };
      });
    },

    async listLibraries(): Promise<Library[]> {
      const rows = await adapter.all<LibraryRow>(
        "SELECT id, name, path, song_count, created_at FROM libraries ORDER BY name COLLATE NOCASE",
      );
      return rows.map(toLibrary);
    },

    async searchSongs(query: string, limit = 50): Promise<Song[]> {
      const q = query.trim();
      if (q === "") {
        const rows = await adapter.all<SongRow>(
          "SELECT * FROM songs ORDER BY title COLLATE NOCASE LIMIT ?",
          [limit],
        );
        return rows.map(toSong);
      }
      const like = `%${q}%`;
      const rows = await adapter.all<SongRow>(
        "SELECT * FROM songs WHERE title LIKE ? OR singer LIKE ? OR CAST(number AS TEXT) LIKE ?" +
          " ORDER BY title COLLATE NOCASE LIMIT ?",
        [like, like, like, limit],
      );
      return rows.map(toSong);
    },

    async deleteLibrary(id: number): Promise<void> {
      await inTransaction(adapter, async () => {
        await adapter.run("DELETE FROM songs WHERE library_id = ?", [id]);
        await adapter.run("DELETE FROM libraries WHERE id = ?", [id]);
      });
    },
  };
}
