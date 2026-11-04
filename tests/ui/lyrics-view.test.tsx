import type { LyricLine } from "@hummyna/hmp";
import { render, screen } from "@testing-library/react-native";
import { LyricsView } from "../../src/ui/lyrics-view";

const lines: LyricLine[] = [
  { timeMs: 1000, text: "A" },
  { timeMs: 2000, text: "B" },
  { timeMs: 3000, text: "C" },
];

describe("LyricsView", () => {
  it("highlights the active line", async () => {
    await render(<LyricsView lines={lines} timeMs={2500} />);
    expect(screen.getByTestId("lyric-current").props.children).toBe("B");
  });

  it("applies the offset", async () => {
    await render(<LyricsView lines={lines} timeMs={500} offsetMs={2000} />);
    expect(screen.getByTestId("lyric-current").props.children).toBe("B");
  });

  it("shows an empty state without lyrics", async () => {
    await render(<LyricsView lines={[]} timeMs={0} />);
    expect(screen.getByText(/no lyrics/i)).toBeTruthy();
  });
});
