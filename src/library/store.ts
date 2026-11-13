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

export interface SearchOptions {
  libraryId?: number;
  limit?: number;
  offset?: number;
}

export interface LibraryStore {
  addLibrary(meta: NewLibrary, songs: NewSong[]): Promise<AddLibraryResult>;
  listLibraries(): Promise<Library[]>;
  getLibrary(id: number): Promise<Library | null>;
  searchSongs(query: string, options?: SearchOptions): Promise<Song[]>;
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
CREATE VIRTUAL TABLE IF NOT EXISTS songs_fts USING fts5(title, singer, number_text);
CREATE TRIGGER IF NOT EXISTS songs_ai AFTER INSERT ON songs BEGIN
  INSERT INTO songs_fts(rowid, title, singer, number_text) VALUES (new.id, new.title, new.singer, CAST(new.number AS TEXT));
END;
CREATE TRIGGER IF NOT EXISTS songs_ad AFTER DELETE ON songs BEGIN
  DELETE FROM songs_fts WHERE rowid = old.id;
END;
CREATE TRIGGER IF NOT EXISTS songs_au AFTER UPDATE ON songs BEGIN
  UPDATE songs_fts SET title = new.title, singer = new.singer, number_text = CAST(new.number AS TEXT) WHERE rowid = new.id;
END;
INSERT INTO songs_fts(rowid, title, singer, number_text)
  SELECT id, title, singer, CAST(number AS TEXT) FROM songs
  WHERE id NOT IN (SELECT rowid FROM songs_fts);
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
    try {
      await adapter.exec("ROLLBACK");
    } catch {
      // keep the original error — a failed rollback must not mask it
    }
    throw err;
  }
}

/**
 * Builds an FTS5 MATCH query: each whitespace token becomes a quoted prefix
 * query (`"g2"*`). Returns null when the query has no searchable tokens (e.g.
 * "%" or "_"), so the caller returns no rows without running FTS.
 */
function toFtsQuery(query: string): string | null {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.replace(/["*]/g, ""))
    .filter((token) => /[\p{L}\p{N}]/u.test(token));
  if (tokens.length === 0) return null;
  return tokens.map((token) => `"${token}"*`).join(" ");
}

export function createLibraryStore(adapter: SqliteAdapter): LibraryStore {
  return {
    async addLibrary(meta: NewLibrary, songs: NewSong[]): Promise<AddLibraryResult> {
      return inTransaction(adapter, async () => {
        // Re-importing the same file replaces its songs but KEEPS the library id
        // stable, so recorded takes (keyed by library id) stay reachable.
        const existing = await adapter.all<{ id: number }>(
          "SELECT id FROM libraries WHERE path = ? ORDER BY id LIMIT 1",
          [meta.path],
        );
        let libraryId: number;
        if (existing.length > 0) {
          libraryId = existing[0].id;
          await adapter.run("DELETE FROM songs WHERE library_id = ?", [libraryId]);
          await adapter.run(
            "UPDATE libraries SET name = ?, song_count = ?, created_at = ? WHERE id = ?",
            [meta.name, songs.length, Date.now(), libraryId],
          );
        } else {
          const inserted = await adapter.run(
            "INSERT INTO libraries (name, path, song_count, created_at) VALUES (?, ?, ?, ?)",
            [meta.name, meta.path, songs.length, Date.now()],
          );
          libraryId = inserted.lastInsertRowid;
        }
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

    async getLibrary(id: number): Promise<Library | null> {
      const rows = await adapter.all<LibraryRow>(
        "SELECT id, name, path, song_count, created_at FROM libraries WHERE id = ?",
        [id],
      );
      return rows.length > 0 ? toLibrary(rows[0]) : null;
    },

    async searchSongs(query: string, options: SearchOptions = {}): Promise<Song[]> {
      const { libraryId, limit = 50, offset = 0 } = options;
      const q = query.trim();

      if (q === "") {
        const clauses: string[] = [];
        const params: SqlValue[] = [];
        if (libraryId !== undefined) {
          clauses.push("library_id = ?");
          params.push(libraryId);
        }
        const where = clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
        params.push(limit, offset);
        const rows = await adapter.all<SongRow>(
          `SELECT * FROM songs${where} ORDER BY title COLLATE NOCASE, id LIMIT ? OFFSET ?`,
          params,
        );
        return rows.map(toSong);
      }

      const match = toFtsQuery(q);
      if (match === null) return [];

      const clauses = ["songs_fts MATCH ?"];
      const params: SqlValue[] = [match];
      if (libraryId !== undefined) {
        clauses.push("s.library_id = ?");
        params.push(libraryId);
      }
      params.push(limit, offset);
      const rows = await adapter.all<SongRow>(
        `SELECT s.* FROM songs s JOIN songs_fts ON songs_fts.rowid = s.id WHERE ${clauses.join(" AND ")}` +
          " ORDER BY s.title COLLATE NOCASE, s.id LIMIT ? OFFSET ?",
        params,
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
