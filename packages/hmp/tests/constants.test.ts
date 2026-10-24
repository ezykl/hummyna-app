import { describe, expect, it } from "vitest";
import { FOOTER_SIZE, HEADER_SIZE, MAGIC_FOOTER, MAGIC_HEADER, MAX_SONGS } from "../src/constants";

describe("constants", () => {
  it("pins the format's exact values", () => {
    expect(Array.from(MAGIC_HEADER)).toEqual([0x48, 0x4d, 0x50, 0x31]); // "HMP1"
    expect(Array.from(MAGIC_FOOTER)).toEqual([0x48, 0x4d, 0x50, 0x45]); // "HMPE"
    expect(HEADER_SIZE).toBe(16);
    expect(FOOTER_SIZE).toBe(76);
    expect(MAX_SONGS).toBe(100_000);
  });
});
