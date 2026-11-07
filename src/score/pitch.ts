import { PitchDetector } from "pitchy";

export interface DetectedFrame {
  timeMs: number;
  midi: number;
  cents: number;
  clarity: number;
}

export function detectFrames(
  pcm: Float32Array,
  sampleRate: number,
  opts: { hopMs?: number; windowMs?: number; minClarity?: number } = {},
): DetectedFrame[] {
  const hopMs = opts.hopMs ?? 40;
  const windowMs = opts.windowMs ?? 50;
  const minClarity = opts.minClarity ?? 0.9;
  if (!(sampleRate > 0)) return [];
  const windowSize = Math.max(2, Math.round((windowMs / 1000) * sampleRate));
  const hopSize = Math.max(1, Math.round((hopMs / 1000) * sampleRate));
  if (pcm.length < windowSize) return [];

  const detector = PitchDetector.forFloat32Array(windowSize);
  const out: DetectedFrame[] = [];
  for (let start = 0; start + windowSize <= pcm.length; start += hopSize) {
    const slice = pcm.subarray(start, start + windowSize);
    let frequency = 0;
    let clarity = 0;
    try {
      [frequency, clarity] = detector.findPitch(slice, sampleRate);
    } catch {
      continue;
    }
    if (!(frequency > 0) || clarity < minClarity) continue;
    const midiFloat = 69 + 12 * Math.log2(frequency / 440);
    const midi = Math.round(midiFloat);
    out.push({
      timeMs: ((start + windowSize / 2) / sampleRate) * 1000,
      midi,
      cents: (midiFloat - midi) * 100,
      clarity,
    });
  }
  return out;
}
