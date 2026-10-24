import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { webCryptoAdapter } from "../src/adapters/crypto";
import { webInflateAdapter } from "../src/adapters/inflate";
import { memoryByteSource } from "../src/byte-source";
import { openHmp } from "../src/reader";
import type { LibraryKeys } from "../src/types";

const load = (p: string): Uint8Array =>
  new Uint8Array(readFileSync(new URL(`./fixtures/${p}`, import.meta.url)));

const keysFile = JSON.parse(new TextDecoder().decode(load("keys.jwk"))) as LibraryKeys;
const expected = JSON.parse(new TextDecoder().decode(load("expected.json"))) as {
  count: number;
  entries: { number: number; title: string; singer: string; length: number }[];
  plaintextSha256: string[];
};

async function sha256(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

describe("openHmp", () => {
  it("reads the index, verifies the signature, and decrypts songs", async () => {
    const lib = await openHmp(memoryByteSource(load("library.hmp")), keysFile, {
      inflate: webInflateAdapter,
      crypto: webCryptoAdapter,
    });

    expect(lib.songCount).toBe(expected.count);
    expect(await lib.verify()).toBe(true);

    const refs = lib.songs();
    expect(refs.map((r) => r.title)).toEqual(expected.entries.map((e) => e.title));
    for (let i = 0; i < refs.length; i++) {
      expect(await sha256(await lib.midiFor(refs[i]))).toBe(expected.plaintextSha256[i]);
    }
  });
});
