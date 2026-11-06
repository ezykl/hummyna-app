import { DatabaseSync } from "node:sqlite";
import type { SqliteAdapter, SqlValue } from "../../src/library/store";
import { createTakesStore, migrateTakes } from "../../src/library/takes";

function nodeAdapter(db: DatabaseSync): SqliteAdapter {
  return {
    exec: async (sql: string) => { db.exec(sql); },
    run: async (sql: string, params: SqlValue[] = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    all: async <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
  };
}

async function freshStore() {
  const db = new DatabaseSync(":memory:");
  const adapter = nodeAdapter(db);
  await migrateTakes(adapter);
  return createTakesStore(adapter);
}

describe("takes store", () => {
  it("adds, lists (newest first), gets, and deletes takes", async () => {
    const store = await freshStore();
    const a = await store.addTake({ libraryId: 1, number: 2, path: "takes/a.wav", durationMs: 1000 });
    const b = await store.addTake({ libraryId: 1, number: 2, path: "takes/b.wav", durationMs: 2000 });
    await store.addTake({ libraryId: 1, number: 9, path: "takes/other.wav", durationMs: 5 });
    const list = await store.listTakes(1, 2);
    expect(list.map((t) => t.id)).toEqual([b, a]);
    expect(list[0]).toMatchObject({ path: "takes/b.wav", durationMs: 2000, libraryId: 1, number: 2 });
    expect(await store.getTake(a)).toMatchObject({ id: a, path: "takes/a.wav" });
    expect(await store.getTake(999)).toBeNull();
    await store.deleteTake(a);
    expect((await store.listTakes(1, 2)).map((t) => t.id)).toEqual([b]);
  });
});
