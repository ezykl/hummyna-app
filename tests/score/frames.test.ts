import { FrameCollector } from "../../src/score/frames";

describe("FrameCollector", () => {
  it("concatenates pushed frames and tracks duration", () => {
    const c = new FrameCollector(1000);
    c.push(new Float32Array([1, 2]));
    c.push(new Float32Array([3, 4, 5]));
    expect(Array.from(c.frames())).toEqual([1, 2, 3, 4, 5]);
    expect(c.durationMs).toBe(5);
    expect(c.sampleRate).toBe(1000);
  });

  it("is empty before any push", () => {
    const c = new FrameCollector(44100);
    expect(c.frames().length).toBe(0);
    expect(c.durationMs).toBe(0);
  });
});
