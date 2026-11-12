import type { SoundFontDiscovery, SoundFontLoaders } from "../../src/audio/sf2";
import { findSoundFontInDocuments, resolveSoundFont, resolveSoundFontBytes } from "../../src/audio/sf2";

const loaders: SoundFontLoaders = {
  readAsset: jest.fn(async () => new Uint8Array([1, 2])),
  readFile: jest.fn(async () => new Uint8Array([3, 4])),
};

describe("resolveSoundFont", () => {
  it("reads a bundled asset", async () => {
    const out = await resolveSoundFont({ kind: "asset", module: 7 }, loaders);
    expect(Array.from(out)).toEqual([1, 2]);
    expect(loaders.readAsset).toHaveBeenCalledWith(7);
  });

  it("reads a file uri", async () => {
    const out = await resolveSoundFont({ kind: "file", uri: "file:///x.sf2" }, loaders);
    expect(Array.from(out)).toEqual([3, 4]);
    expect(loaders.readFile).toHaveBeenCalledWith("file:///x.sf2");
  });

  it("throws a friendly error when unconfigured", async () => {
    await expect(resolveSoundFont(null, loaders)).rejects.toThrow(/SoundFont/i);
  });
});

const bytesLoaders: SoundFontLoaders = {
  readAsset: jest.fn(async () => new Uint8Array([1])),
  readFile: jest.fn(async () => new Uint8Array([2])),
};
const discovery = (names: string[]): SoundFontDiscovery => ({
  listDocuments: jest.fn(async () => names.map((name) => ({ name, uri: `file:///doc/${name}` }))),
});

describe("findSoundFontInDocuments", () => {
  it("picks the first .sf2/.sf3 alphabetically", async () => {
    const found = await findSoundFontInDocuments(discovery(["zzz.sf2", "aaa.sf3", "notes.txt"]));
    expect(found).toEqual({ kind: "file", uri: "file:///doc/aaa.sf3" });
  });
  it("returns null when none match", async () => {
    expect(await findSoundFontInDocuments(discovery(["a.txt", "b.mid"]))).toBeNull();
  });
  it("prefers a user-selected file over others", async () => {
    const found = await findSoundFontInDocuments(discovery(["aaa.sf2", "selected.sf3", "zzz.sf2"]));
    expect(found).toEqual({ kind: "file", uri: "file:///doc/selected.sf3" });
  });
});

describe("resolveSoundFontBytes", () => {
  it("prefers the configured source", async () => {
    const bytes = await resolveSoundFontBytes({ kind: "asset", module: 5 }, discovery([]), bytesLoaders);
    expect(Array.from(bytes)).toEqual([1]);
    expect(bytesLoaders.readAsset).toHaveBeenCalledWith(5);
  });
  it("falls back to a Documents .sf2", async () => {
    const bytes = await resolveSoundFontBytes(null, discovery(["gm.sf2"]), bytesLoaders);
    expect(Array.from(bytes)).toEqual([2]);
    expect(bytesLoaders.readFile).toHaveBeenCalledWith("file:///doc/gm.sf2");
  });
  it("throws a friendly error when nothing is available", async () => {
    await expect(resolveSoundFontBytes(null, discovery([]), bytesLoaders)).rejects.toThrow(/SoundFont/i);
  });
});
