import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ByteSource, LibraryKeys } from "@hummyna/hmp";
import { memoryByteSource } from "@hummyna/hmp";
import { rnCryptoAdapter } from "../../src/platform/rn-crypto";
import { rnInflateAdapter } from "../../src/platform/rn-inflate";
import type { NewSong, LibraryStore } from "../../src/library/store";
import { importLibrary } from "../../src/library/import";

const fixtures = join(__dirname, "..", "..", "packages", "hmp", "tests", "fixtures");
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(fixtures, name)));
const keys = JSON.parse(new TextDecoder().decode(fixture("keys.jwk"))) as LibraryKeys;

class FakeStore implements LibraryStore {
  added: { name: string; path: string; songs: NewSong[] }[] = [];
  addLibrary = jest.fn(async (meta: { name: string; path: string }, songs: NewSong[]) => {
    this.added.push({ ...meta, songs });
    return { libraryId: this.added.length, songCount: songs.length };
  });
  listLibraries = jest.fn(async () => []);
  searchSongs = jest.fn(async () => []);
  deleteLibrary = jest.fn(async () => {});
}

const sourceFor =
  (bytes: Uint8Array) =>
  async (_uri: string): Promise<ByteSource> =>
    memoryByteSource(bytes);

describe("importLibrary", () => {
  it("imports the golden .hmp: one library row + three songs", async () => {
    const store = new FakeStore();
    const result = await importLibrary("file:///library.hmp", "Golden", {
      sourceFor: sourceFor(fixture("library.hmp")),
      keys,
      store,
      crypto: rnCryptoAdapter,
      inflate: rnInflateAdapter,
    });

    expect(result).toEqual({ libraryId: 1, songCount: 3 });
    expect(store.addLibrary).toHaveBeenCalledTimes(1);
    const [meta, songs] = store.addLibrary.mock.calls[0];
    expect(meta).toEqual({ name: "Golden", path: "file:///library.hmp" });
    expect(songs.map((s) => s.title)).toEqual(["G1", "G2", "G3"]);
    expect(songs[0]).toMatchObject({ number: 1, singer: "S1", title: "G1", length: 80 });
  });

  it("rejects a corrupt file with a friendly error and writes nothing", async () => {
    const corrupt = fixture("library.hmp").slice();
    corrupt[0] = 0x00;
    const store = new FakeStore();

    await expect(
      importLibrary("file:///bad.hmp", "Bad", {
        sourceFor: sourceFor(corrupt),
        keys,
        store,
        crypto: rnCryptoAdapter,
        inflate: rnInflateAdapter,
      }),
    ).rejects.toThrow(/import|not an HMP1|corrupt|magic/i);

    expect(store.addLibrary).not.toHaveBeenCalled();
  });
});
