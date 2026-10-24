import { describe, expect, it } from "vitest";
import { memoryByteSource } from "../src/byte-source";

describe("memoryByteSource", () => {
  it("returns exact ranges and clamps at EOF", async () => {
    const src = memoryByteSource(new Uint8Array([0, 1, 2, 3, 4, 5]));
    expect(src.size).toBe(6);
    expect(Array.from(await src.read(2, 3))).toEqual([2, 3, 4]);
    expect(Array.from(await src.read(4, 10))).toEqual([4, 5]); // clamped
    expect((await src.read(6, 1)).length).toBe(0);
  });
});
