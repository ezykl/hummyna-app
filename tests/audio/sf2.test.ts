import type { SoundFontLoaders } from "../../src/audio/sf2";
import { resolveSoundFont } from "../../src/audio/sf2";

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
