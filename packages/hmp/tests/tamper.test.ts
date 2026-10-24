import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { memoryByteSource } from "../src/byte-source";
import { openHmp } from "../src/reader";
import type { LibraryKeys } from "../src/types";

const load = (p: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${p}`, import.meta.url)));

const keysFile = JSON.parse(new TextDecoder().decode(load("keys.jwk"))) as LibraryKeys;

const FOOTER = 76;
const SIG = 64;

function indexOffsetOf(bytes: Uint8Array): number {
  const footerAt = bytes.length - FOOTER;
  return Number(new DataView(bytes.buffer, bytes.byteOffset + footerAt, 8).getBigUint64(0, true));
}

describe("tamper rejection", () => {
  it("rejects a bit-flip inside a song block", async () => {
    const bytes = load("library.hmp");
    const ref = (await openHmp(memoryByteSource(bytes), keysFile)).songs()[0];
    bytes[ref.offset + 12] ^= 0x01; // first ciphertext byte after the 12-byte nonce
    const lib = await openHmp(memoryByteSource(bytes), keysFile);
    await expect(lib.midiFor(lib.songs()[0])).rejects.toThrow();
  });

  it("rejects an edited index (signature mismatch)", async () => {
    const bytes = load("library.hmp");
    const io = indexOffsetOf(bytes);
    bytes[io + 12] ^= 0x01; // a byte of the first title (count 4 + number 4 + titleLen 4)
    const lib = await openHmp(memoryByteSource(bytes), keysFile);
    expect(await lib.verify()).toBe(false);
  });

  it("rejects a blanked/foreign signature", async () => {
    const bytes = load("library.hmp");
    const footerAt = bytes.length - FOOTER;
    for (let i = 0; i < SIG; i++) bytes[footerAt + 8 + i] = 0;
    const lib = await openHmp(memoryByteSource(bytes), keysFile);
    expect(await lib.verify()).toBe(false);
  });

  it("rejects a file with bad magic", async () => {
    const bytes = load("library.hmp");
    bytes[0] = 0x00;
    await expect(openHmp(memoryByteSource(bytes), keysFile)).rejects.toThrow();
  });

  it("rejects a truncated file", async () => {
    const bytes = load("library.hmp").subarray(0, 40);
    await expect(openHmp(memoryByteSource(bytes), keysFile)).rejects.toThrow();
  });
});
