import { fireEvent, render, screen } from "@testing-library/react-native";
import type { ScoreResult } from "../../src/score/score";
import { ResultsView } from "../../src/ui/results-view";

const result: ScoreResult = {
  noteCount: 4,
  hitCount: 3,
  accuracy: 0.75,
  bestStreak: 2,
  grade: "B",
  notes: [],
  lines: [],
};

describe("ResultsView", () => {
  it("shows grade, percent, streak, the fun label and fires Sing again", async () => {
    const onSingAgain = jest.fn();
    await render(<ResultsView result={result} funMode onSingAgain={onSingAgain} />);
    expect(screen.getByText("B")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
    expect(screen.getByText(/fun mode/i)).toBeTruthy();
    await fireEvent.press(screen.getByText("Sing again"));
    expect(onSingAgain).toHaveBeenCalled();
  });

  it("omits the fun label when not fun mode", async () => {
    await render(<ResultsView result={result} onSingAgain={jest.fn()} />);
    expect(screen.queryByText(/fun mode/i)).toBeNull();
  });
});
