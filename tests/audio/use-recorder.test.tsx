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
    expect(rec.listenerCount).toBe(1);

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
    expect(rec.listenerCount).toBe(0);
  });

  it("re-entrant start replaces the previous frame subscription", async () => {
    const rec = new FakeMicRecorder();
    const { result } = await renderHook(() => useRecorder(rec));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });
    expect(rec.listenerCount).toBe(1);
  });

  it("disposes the recorder on unmount", async () => {
    const rec = new FakeMicRecorder();
    const { result, unmount } = await renderHook(() => useRecorder(rec));
    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      unmount();
    });
    expect(rec.disposed).toBe(1);
    expect(rec.listenerCount).toBe(0);
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

  it("returns false on permission failure and errors when stop fails", async () => {
    const rec = new FakeMicRecorder();
    rec.failPrepare = new Error("mic denied");
    const { result } = await renderHook(() => useRecorder(rec));
    let ok = true;
    await act(async () => {
      ok = await result.current.start();
    });
    expect(ok).toBe(false);
    // fresh recorder that records, then a failing stop
    const rec2 = new FakeMicRecorder();
    const h = await renderHook(() => useRecorder(rec2));
    await act(async () => {
      await h.result.current.start();
    });
    rec2.failStop = new Error("finalize failed");
    await act(async () => {
      await h.result.current.stop();
    });
    expect(h.result.current.status).toBe("error");
    expect(h.result.current.error).toMatch(/finalize failed/);
  });
});
