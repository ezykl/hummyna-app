import { randomScore } from "../../src/score/fun";

describe("randomScore", () => {
  it("is deterministic per seed and stays in range", () => {
    const a = randomScore(12, 42);
    const b = randomScore(12, 42);
    expect(a.accuracy).toBe(b.accuracy);
    expect(a.grade).toBe(b.grade);
    expect(a.noteCount).toBe(12);
    expect(a.accuracy).toBeGreaterThanOrEqual(0);
    expect(a.accuracy).toBeLessThanOrEqual(1);
    expect(["S", "A", "B", "C", "D"]).toContain(a.grade);
  });

  it("differs across seeds and has empty lines", () => {
    expect(randomScore(20, 1).accuracy).not.toBe(randomScore(20, 2).accuracy);
    expect(randomScore(5, 7).lines).toEqual([]);
  });
});
