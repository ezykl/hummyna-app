import type { LyricLine } from "@hummyna/hmp";
import { currentLineIndex, lineProgress } from "../../src/lyrics/timeline";

const line = (timeMs: number, text: string): LyricLine => ({ timeMs, text });
const lines: LyricLine[] = [line(1000, "A"), line(2000, "B"), line(3000, "C")];

describe("currentLineIndex", () => {
  it("returns -1 before the first line or when empty", () => {
    expect(currentLineIndex([], 5000)).toBe(-1);
    expect(currentLineIndex(lines, 0)).toBe(-1);
    expect(currentLineIndex(lines, 999)).toBe(-1);
  });

  it("returns the active line at and after its start", () => {
    expect(currentLineIndex(lines, 1000)).toBe(0);
    expect(currentLineIndex(lines, 1999)).toBe(0);
    expect(currentLineIndex(lines, 2000)).toBe(1);
    expect(currentLineIndex(lines, 99999)).toBe(2);
  });
});

describe("lineProgress", () => {
  it("is 0 for the last line and for non-advancing spans", () => {
    expect(lineProgress(line(3000, "C"), undefined, 3500)).toBe(0);
    expect(lineProgress(line(1000, "A"), line(1000, "B"), 1000)).toBe(0);
  });

  it("clamps to 0..1 across the span", () => {
    expect(lineProgress(lines[0], lines[1], 500)).toBe(0);
    expect(lineProgress(lines[0], lines[1], 1500)).toBe(0.5);
    expect(lineProgress(lines[0], lines[1], 2500)).toBe(1);
  });
});
