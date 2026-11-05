import { act, renderHook } from "@testing-library/react-native";
import { useRecorder } from "../../src/audio/use-recorder";
import { FakeMicRecorder } from "../helpers/fake-mic-recorder";

describe("useRecorder", () => {
  it("records: prepare, start, level + elapsed from frames, stop returns a take", async () => {
    let clock = 0;
    const rec = new FakeMicRecorder();
    const { result } = await renderHook(() => useRecorder(rec, { now: () => clock }));
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.start();
    });
    expect(rec.prepared).toBe(1);
    expect(rec.started).toBe(1);
    expect(result.current.status).toBe("recording");

    clock = 500;
    await act(async () => {
      rec.emit(new Float32Array([0.5, -0.5, 0.5, -0.5]));
    });
    expect(result.current.elapsedSec).toBe(0.5);
    expect(result.current.level).toBeCloseTo(0.5, 5);

    let take = null as Awaited<ReturnType<typeof result.current.stop>>;
    await act(async () => {
      take = await result.current.stop();
    });
    expect(take).toMatchObject({ uri: "file:///take.wav" });
    expect(result.current.status).toBe("idle");
  });

  it("surfaces a permission error from prepare", async () => {
    const rec = new FakeMicRecorder();
    rec.failPrepare = new Error("mic denied");
    const { result } = await renderHook(() => useRecorder(rec));
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/mic denied/);
  });
});
