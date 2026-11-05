import { fireEvent, render, screen } from "@testing-library/react-native";
import { RecordView, formatElapsed } from "../../src/ui/record-view";

describe("RecordView", () => {
  it("shows Record and starts", async () => {
    const onStart = jest.fn();
    await render(
      <RecordView title="G1" singer="S1" status="idle" elapsedSec={0} level={0} error={null} onStart={onStart} onStop={jest.fn()} />,
    );
    fireEvent.press(screen.getByText("Record"));
    expect(onStart).toHaveBeenCalled();
  });

  it("shows Stop while recording and stops", async () => {
    const onStop = jest.fn();
    await render(
      <RecordView title="G1" singer="S1" status="recording" elapsedSec={5} level={0.5} error={null} onStart={jest.fn()} onStop={onStop} />,
    );
    expect(screen.getByText("Stop")).toBeTruthy();
    fireEvent.press(screen.getByText("Stop"));
    expect(onStop).toHaveBeenCalled();
  });

  it("shows an error and formats elapsed", async () => {
    await render(
      <RecordView title="G1" singer="S1" status="error" elapsedSec={65} level={0} error="mic denied" onStart={jest.fn()} onStop={jest.fn()} />,
    );
    expect(screen.getByTestId("recorder-error")).toBeTruthy();
    expect(formatElapsed(65)).toBe("1:05");
  });
});
