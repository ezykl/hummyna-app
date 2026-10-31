import { hmpNameFromUri, isHmpName } from "../../src/platform/pick-library";

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
