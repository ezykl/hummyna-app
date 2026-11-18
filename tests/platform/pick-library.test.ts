import type { SafLister } from "../../src/platform/pick-library";
import { collectHmpUris, hmpNameFromUri, isHmpName } from "../../src/platform/pick-library";

describe("pick-library helpers", () => {
  it("derives a display name from SAF and file URIs", () => {
    expect(hmpNameFromUri("content://p/tree/primary%3AMusic/document/primary%3AMusic%2Fsong.hmp")).toBe(
      "song.hmp",
    );
    expect(hmpNameFromUri("file:///data/user/0/app/files/Pop%20Hits.hmp")).toBe("Pop Hits.hmp");
  });

  it("matches .hmp case-insensitively", () => {
    expect(isHmpName("song.hmp")).toBe(true);
    expect(isHmpName("SONG.HMP")).toBe(true);
    expect(isHmpName("song.mid")).toBe(false);
  });
});

describe("collectHmpUris", () => {
  const lister = (tree: Record<string, string[]>): SafLister => ({
    listDirectory: async (dir: string) => {
      if (!(dir in tree)) throw new Error("not a directory");
      return tree[dir];
    },
  });

  it("collects .hmp files from the root and nested folders", async () => {
    const found = await collectHmpUris(
      lister({
        "dir:root": ["dir:root/top.hmp", "dir:root/sub"],
        "dir:root/sub": ["dir:root/sub/deep.hmp", "dir:root/sub/notes.txt"],
      }),
      "dir:root",
    );
    expect(found.map((f) => f.name).sort()).toEqual(["deep.hmp", "top.hmp"]);
  });

  it("respects the depth limit", async () => {
    const found = await collectHmpUris(
      lister({
        "dir:root": ["dir:root/a"],
        "dir:root/a": ["dir:root/a/b"],
        "dir:root/a/b": ["dir:root/a/b/deep.hmp"],
      }),
      "dir:root",
      1,
    );
    expect(found).toHaveLength(0);
  });

  it("scans one level deep by default", async () => {
    const found = await collectHmpUris(
      lister({ "dir:root": ["dir:root/sub"], "dir:root/sub": ["dir:root/sub/x.hmp"] }),
      "dir:root",
      1,
    );
    expect(found.map((f) => f.name)).toEqual(["x.hmp"]);
  });

  it("survives cycles between folders", async () => {
    const found = await collectHmpUris(
      lister({ "dir:a": ["dir:a/b", "dir:a/one.hmp"], "dir:a/b": ["dir:a"] }),
      "dir:a",
    );
    expect(found.map((f) => f.name)).toEqual(["one.hmp"]);
  });

  it("returns [] when the root is not a directory", async () => {
    expect(await collectHmpUris(lister({}), "dir:missing")).toEqual([]);
  });
});
