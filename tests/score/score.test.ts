import type { LyricLine, ReferenceNote } from "@hummyna/hmp";
import type { DetectedFrame } from "../../src/score/pitch";
import { scorePerformance } from "../../src/score/score";

const note = (startMs: number, endMs: number, midi: number): ReferenceNote => ({ startMs, endMs, midi });
const frame = (timeMs: number, midi: number, cents = 0): DetectedFrame => ({ timeMs, midi, cents, clarity: 1 });

describe("scorePerformance", () => {
  it("scores an all-hit take as S / 1.0", () => {
    const r = scorePerformance([note(0, 500, 69)], [frame(250, 69, 5)]);
    expect(r.noteCount).toBe(1);
    expect(r.hitCount).toBe(1);
    expect(r.accuracy).toBe(1);
    expect(r.grade).toBe("S");
    expect(r.bestStreak).toBe(1);
  });

  it("scores half and computes the longest streak", () => {
    const ref = [note(0, 500, 60), note(500, 1000, 62), note(1000, 1500, 64)];
    const det = [frame(250, 60), frame(750, 62)];
    const r = scorePerformance(ref, det);
    expect(r.hitCount).toBe(2);
    expect(r.accuracy).toBeCloseTo(2 / 3, 5);
    expect(r.bestStreak).toBe(2);
    expect(r.grade).toBe("B");
  });

  it("treats out-of-tolerance pitch as a miss", () => {
    expect(scorePerformance([note(0, 500, 69)], [frame(250, 71)]).hitCount).toBe(0);
    expect(scorePerformance([note(0, 500, 69)], [frame(250, 71)]).grade).toBe("D");
  });

  it("shifts hits by the calibration offset", () => {
    const ref = [note(1000, 1500, 60)];
    const det = [frame(1700, 60)];
    expect(scorePerformance(ref, det).hitCount).toBe(0);
    expect(scorePerformance(ref, det, { offsetMs: 100 }).hitCount).toBe(1);
  });

  it("groups notes into lyric lines", () => {
    const ref = [note(0, 400, 60), note(500, 900, 62)];
    const det = [frame(200, 60), frame(700, 62)];
    const lines: LyricLine[] = [
      { timeMs: 0, text: "a" },
      { timeMs: 500, text: "b" },
    ];
    const r = scorePerformance(ref, det, { lines });
    expect(r.lines.map((l) => l.accuracy)).toEqual([1, 1]);
  });

  it("never divides by zero", () => {
    expect(scorePerformance([], []).accuracy).toBe(0);
    expect(scorePerformance([], []).lines).toEqual([]);
  });
});
