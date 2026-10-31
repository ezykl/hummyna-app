import { deflateRaw } from "pako";
import { rnInflateAdapter } from "../../src/platform/rn-inflate";

describe("rnInflateAdapter", () => {
  it("inflates raw deflate-raw bytes", async () => {
    const src = new TextEncoder().encode("karaoke ".repeat(50));
    const deflated = deflateRaw(src);
    const out = await rnInflateAdapter.rawInflate(deflated);
    expect(new TextDecoder().decode(out)).toBe("karaoke ".repeat(50));
  });
});
