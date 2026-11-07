import { detectFrames } from "../../src/score/pitch";

function sine(freq: number, sampleRate: number, ms: number): Float32Array {
  const n = Math.round((sampleRate * ms) / 1000);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

describe("detectFrames", () => {
  it("detects A440 as MIDI 69", () => {
    const frames = detectFrames(sine(440, 44100, 400), 44100);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.midi === 69)).toBe(true);
    expect(Math.abs(frames[0].cents)).toBeLessThan(10);
  });

  it("detects A220 as MIDI 57", () => {
    const frames = detectFrames(sine(220, 44100, 400), 44100);
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((f) => f.midi === 57)).toBe(true);
  });

  it("returns no frames for silence", () => {
    expect(detectFrames(new Float32Array(44100), 44100)).toEqual([]);
  });
});
