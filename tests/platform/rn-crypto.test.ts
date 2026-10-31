import { readFileSync } from "node:fs";
import { join } from "node:path";
import { memoryByteSource, openHmp } from "@hummyna/hmp";
import type { LibraryKeys } from "@hummyna/hmp";
import { rnCryptoAdapter } from "../../src/platform/rn-crypto";
import { rnInflateAdapter } from "../../src/platform/rn-inflate";

const fixtures = join(__dirname, "..", "..", "packages", "hmp", "tests", "fixtures");
const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(fixtures, name)));

describe("rnCryptoAdapter", () => {
  it("opens the golden .hmp (unwrap + verify + decrypt) with pure-JS crypto", async () => {
    const keys = JSON.parse(new TextDecoder().decode(fixture("keys.jwk"))) as LibraryKeys;
    const lib = await openHmp(memoryByteSource(fixture("library.hmp")), keys, {
      crypto: rnCryptoAdapter,
      inflate: rnInflateAdapter,
    });
    expect(lib.songCount).toBe(3);
    expect(await lib.verify()).toBe(true);
    expect((await lib.midiFor(lib.songs()[0])).length).toBeGreaterThan(0);
  });
});
