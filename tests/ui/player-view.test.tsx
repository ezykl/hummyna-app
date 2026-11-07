import type { LyricLine } from "@hummyna/hmp";
import { fireEvent, render, screen } from "@testing-library/react-native";
import type { PlayerController } from "../../src/audio/use-player";
import { PlayerView } from "../../src/ui/player-view";

const lines: LyricLine[] = [{ timeMs: 0, text: "hello" }];

function stubController(overrides: Partial<PlayerController> = {}): PlayerController {
  return {
    status: "ready",
    positionSec: 30,
    durationSec: 120,
    error: null,
    load: jest.fn(),
    play: jest.fn(),
    pause: jest.fn(),
    toggle: jest.fn(),
    stop: jest.fn(),
    seek: jest.fn(),
    setVolume: jest.fn(),
    ...overrides,
  };
}

describe("PlayerView", () => {
  it("shows Play when not playing and toggles on press", async () => {
    const controller = stubController();
    await render(<PlayerView title="G1" singer="S1" lines={lines} controller={controller} />);
    expect(screen.getByText("Play")).toBeTruthy();
    fireEvent.press(screen.getByText("Play"));
    expect(controller.toggle).toHaveBeenCalled();
  });

  it("shows Pause while playing", async () => {
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController({ status: "playing" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
  });

  it("seeks forward 10s from the current position", async () => {
    const controller = stubController({ positionSec: 30 });
    await render(<PlayerView title="G1" singer="S1" lines={lines} controller={controller} />);
    fireEvent.press(screen.getByText("+10s"));
    expect(controller.seek).toHaveBeenCalledWith(40);
  });

  it("shows an error banner", async () => {
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController({ error: "boom" })} />,
    );
    expect(screen.getByText("boom")).toBeTruthy();
  });

  it("triggers recording from the Record button", async () => {
    const onRecord = jest.fn();
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController()} onRecord={onRecord} />,
    );
    await fireEvent.press(screen.getByText("Record"));
    expect(onRecord).toHaveBeenCalled();
  });

  it("triggers the takes list", async () => {
    const onTakes = jest.fn();
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController()} onTakes={onTakes} />,
    );
    await fireEvent.press(screen.getByText("Takes"));
    expect(onTakes).toHaveBeenCalled();
  });

  it("triggers the fun score", async () => {
    const onFunScore = jest.fn();
    await render(
      <PlayerView title="G1" singer="S1" lines={lines} controller={stubController()} onFunScore={onFunScore} />,
    );
    await fireEvent.press(screen.getByText("Fun"));
    expect(onFunScore).toHaveBeenCalled();
  });
});
