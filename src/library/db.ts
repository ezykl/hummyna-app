import * as SQLite from "expo-sqlite";
import type { SQLiteBindParams } from "expo-sqlite";
import type { LibraryStore, SqlValue, SqliteAdapter } from "./store";
import { createLibraryStore, migrate } from "./store";

export * from "./store";

/** Wraps an expo-sqlite database in the testable {@link SqliteAdapter} seam. */
export function expoSqliteAdapter(db: SQLite.SQLiteDatabase): SqliteAdapter {
  return {
    async exec(sql: string): Promise<void> {
      await db.execAsync(sql);
    },
    async run(sql: string, params: SqlValue[] = []) {
      const result = await db.runAsync(sql, params as SQLiteBindParams);
      return { lastInsertRowid: Number(result.lastInsertRowId), changes: Number(result.changes) };
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      return db.getAllAsync<T>(sql, params as SQLiteBindParams);
    },
  };
}

let cached: Promise<LibraryStore> | undefined;

/** Opens (once) and migrates the library database, returning a shared store. */
export function openLibraryDb(name = "hummyna.db"): Promise<LibraryStore> {
  if (!cached) {
    cached = (async () => {
      const db = SQLite.openDatabaseSync(name);
      const adapter = expoSqliteAdapter(db);
      await migrate(adapter);
      return createLibraryStore(adapter);
    })().catch((err) => {
      cached = undefined; // a transient open/migrate failure must not poison future calls
      throw err;
    });
  }
  return cached;
}
