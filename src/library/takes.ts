import type { SqliteAdapter, SqlValue } from "./store";

export interface TakeRecord {
  id: number; libraryId: number; number: number; path: string; createdAt: number; durationMs: number;
}
export interface NewTake {
  libraryId: number; number: number; path: string; durationMs: number;
}
export interface TakesStore {
  addTake(input: NewTake): Promise<number>;
  listTakes(libraryId: number, number: number): Promise<TakeRecord[]>;
  getTake(id: number): Promise<TakeRecord | null>;
  deleteTake(id: number): Promise<void>;
}

export const TAKES_SCHEMA = `
CREATE TABLE IF NOT EXISTS takes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL,
  number INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_takes_song ON takes(library_id, number);
`;

interface TakeRow {
  id: number; library_id: number; number: number; path: string; created_at: number; duration_ms: number;
}

const toTake = (r: TakeRow): TakeRecord => ({
  id: r.id, libraryId: r.library_id, number: r.number, path: r.path, createdAt: r.created_at, durationMs: r.duration_ms,
});

export async function migrateTakes(adapter: SqliteAdapter): Promise<void> {
  await adapter.exec(TAKES_SCHEMA);
}

export function createTakesStore(adapter: SqliteAdapter): TakesStore {
  return {
    async addTake(input: NewTake): Promise<number> {
      const { lastInsertRowid } = await adapter.run(
        "INSERT INTO takes (library_id, number, path, created_at, duration_ms) VALUES (?, ?, ?, ?, ?)",
        [input.libraryId, input.number, input.path, Date.now(), input.durationMs],
      );
      return lastInsertRowid;
    },
    async listTakes(libraryId: number, number: number): Promise<TakeRecord[]> {
      const rows = await adapter.all<TakeRow>(
        "SELECT * FROM takes WHERE library_id = ? AND number = ? ORDER BY created_at DESC, id DESC",
        [libraryId, number],
      );
      return rows.map(toTake);
    },
    async getTake(id: number): Promise<TakeRecord | null> {
      const rows = await adapter.all<TakeRow>("SELECT * FROM takes WHERE id = ?", [id]);
      return rows.length > 0 ? toTake(rows[0]) : null;
    },
    async deleteTake(id: number): Promise<void> {
      await adapter.run("DELETE FROM takes WHERE id = ?", [id]);
    },
  };
}

export type { SqlValue };
