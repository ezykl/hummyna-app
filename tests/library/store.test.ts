import { DatabaseSync } from "node:sqlite";
import type { NewSong, SqliteAdapter, SqlValue } from "../../src/library/store";
import { createLibraryStore, migrate } from "../../src/library/store";

function nodeAdapter(db: DatabaseSync): SqliteAdapter {
  return {
    exec: async (sql: string) => {
      db.exec(sql);
    },
    run: async (sql: string, params: SqlValue[] = []) => {
      const r = db.prepare(sql).run(...params);
      return { lastInsertRowid: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    all: async <T>(sql: string, params: SqlValue[] = []) => db.prepare(sql).all(...params) as T[],
  };
}

const songs: NewSong[] = [
  { number: 1, title: "G1", singer: "S1", offset: 100, length: 80 },
  { number: 2, title: "G2", singer: "S2", offset: 200, length: 109 },
  { number: 3, title: "G3", singer: "S3", offset: 300, length: 88 },
];

async function freshStore() {
  const db = new DatabaseSync(":memory:");
  const adapter = nodeAdapter(db);
  await migrate(adapter);
  return createLibraryStore(adapter);
}

describe("library store", () => {
  it("adds a library with its songs and lists it", async () => {
    const store = await freshStore();
    const { libraryId, songCount } = await store.addLibrary(
      { name: "Pop", path: "content://lib/pop.hmp" },
      songs,
    );
    expect(songCount).toBe(3);

    const libs = await store.listLibraries();
    expect(libs).toHaveLength(1);
    expect(libs[0]).toMatchObject({ id: libraryId, name: "Pop", path: "content://lib/pop.hmp", songCount: 3 });
  });

  it("searches songs by title", async () => {
    const store = await freshStore();
    await store.addLibrary({ name: "Pop", path: "p" }, songs);
    const hits = await store.searchSongs("G2");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ number: 2, title: "G2", singer: "S2" });
  });

  it("searches songs by singer", async () => {
    const store = await freshStore();
    await store.addLibrary({ name: "Pop", path: "p" }, songs);
    const hits = await store.searchSongs("S1");
    expect(hits).toHaveLength(1);
    expect(hits[0].number).toBe(1);
  });

  it("returns all songs for an empty query and honours the limit", async () => {
    const store = await freshStore();
    await store.addLibrary({ name: "Pop", path: "p" }, songs);
    expect(await store.searchSongs("")).toHaveLength(3);
    expect(await store.searchSongs("", 2)).toHaveLength(2);
  });

  it("deletes a library and its songs", async () => {
    const store = await freshStore();
    const { libraryId } = await store.addLibrary({ name: "Pop", path: "p" }, songs);
    await store.deleteLibrary(libraryId);
    expect(await store.listLibraries()).toHaveLength(0);
    expect(await store.searchSongs("")).toHaveLength(0);
  });

  it("rolls back the whole add when a song insert fails", async () => {
    const store = await freshStore();
    const bad = [...songs, { number: 4, title: null as unknown as string, singer: "x", offset: 0, length: 1 }];
    await expect(store.addLibrary({ name: "Bad", path: "p" }, bad)).rejects.toBeTruthy();
    expect(await store.listLibraries()).toHaveLength(0);
  });
});
