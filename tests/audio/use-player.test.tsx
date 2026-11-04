import { act, renderHook } from "@testing-library/react-native";
import { usePlayer } from "../../src/audio/use-player";
import { FakeEngine } from "../helpers/fake-engine";

describe("usePlayer", () => {
  it("loads a song and reflects transport state", async () => {
    const engine = new FakeEngine();
    const { result } = await renderHook(() => usePlayer(engine));
    expect(result.current.status).toBe("idle");

    await act(async () => {
      await result.current.load(new Uint8Array([1]));
    });
    expect(result.current.status).toBe("ready");
    expect(result.current.durationSec).toBe(180);

    await act(async () => {
      result.current.play();
    });
    expect(result.current.status).toBe("playing");
    expect(engine.isPlaying()).toBe(true);

    await act(async () => {
      engine.emitProgress(42);
    });
    expect(result.current.positionSec).toBe(42);

    await act(async () => {
      result.current.toggle();
    });
    expect(result.current.status).toBe("paused");
  });

  it("surfaces engine-level errors", async () => {
    const engine = new FakeEngine();
    const { result } = await renderHook(() => usePlayer(engine));
    await act(async () => {
      engine.emitError("worklet failed");
    });
    expect(result.current.error).toMatch(/worklet failed/);
  });

  it("surfaces load errors", async () => {
    const engine = new FakeEngine();
    engine.init = jest.fn(async () => {
      throw new Error("boom");
    });
    const { result } = await renderHook(() => usePlayer(engine));
    await act(async () => {
      await result.current.load(new Uint8Array([1]));
    });
    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/boom/);
  });
});
