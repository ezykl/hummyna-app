import { fireEvent, render, screen } from "@testing-library/react-native";
import type { TakeRecord } from "../../src/library/takes";
import { TakesView, formatDuration } from "../../src/ui/takes-view";

const take: TakeRecord = {
  id: 1,
  libraryId: 1,
  number: 2,
  path: "takes/a.wav",
  createdAt: Date.UTC(2026, 0, 3),
  durationMs: 65000,
};

describe("TakesView", () => {
  it("lists a take and wires play/delete", async () => {
    const onPlay = jest.fn();
    const onDelete = jest.fn();
    await render(<TakesView takes={[take]} onPlay={onPlay} onDelete={onDelete} />);
    expect(screen.getByText(/2026-01-0[23]/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Play"));
    expect(onPlay).toHaveBeenCalledWith(take);
    await fireEvent.press(screen.getByText("Delete"));
    expect(onDelete).toHaveBeenCalledWith(take);
  });

  it("shows an empty state and formats duration", async () => {
    await render(<TakesView takes={[]} onPlay={jest.fn()} onDelete={jest.fn()} />);
    expect(screen.getByText(/no takes/i)).toBeTruthy();
    expect(formatDuration(65000)).toBe("1:05");
  });
});
