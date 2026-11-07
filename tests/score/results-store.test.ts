import { getLastResult, setLastResult } from "../../src/score/results-store";
import { scorePerformance } from "../../src/score/score";

describe("results store", () => {
  it("stores the last result with its flags", () => {
    const result = scorePerformance([], []);
    setLastResult(result, { funMode: true });
    expect(getLastResult()).toEqual({ result, funMode: true });
  });
});
