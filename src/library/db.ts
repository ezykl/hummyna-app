import * as SQLite from "expo-sqlite";
import type { SQLiteBindParams } from "expo-sqlite";
import type { LibraryStore, SqlValue, SqliteAdapter } from "./store";
import { createLibraryStore, migrate } from "./store";
import { createTakesStore, migrateTakes } from "./takes";
import type { TakesStore } from "./takes";

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

let cachedAdapter: Promise<SqliteAdapter> | undefined;

function openAdapter(name: string): Promise<SqliteAdapter> {
  if (!cachedAdapter) {
    cachedAdapter = (async () => {
      const db = SQLite.openDatabaseSync(name);
      const adapter = expoSqliteAdapter(db);
      await migrate(adapter);
      await migrateTakes(adapter);
      return adapter;
    })().catch((err) => {
      cachedAdapter = undefined; // a transient open/migrate failure must not poison future calls
      throw err;
    });
  }
  return cachedAdapter;
}

/** Opens (once) and migrates the library database, returning a shared store. */
export async function openLibraryDb(name = "hummyna.db"): Promise<LibraryStore> {
  return createLibraryStore(await openAdapter(name));
}

/** Opens (once) and migrates the database, returning a shared takes store. */
export async function openTakesStore(name = "hummyna.db"): Promise<TakesStore> {
  return createTakesStore(await openAdapter(name));
}
