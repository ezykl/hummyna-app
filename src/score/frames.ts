/** Accumulates PCM frames captured during a take into one buffer. */
export class FrameCollector {
  private readonly chunks: Float32Array[] = [];
  private length = 0;

  constructor(readonly sampleRate: number) {}

  push(pcm: Float32Array): void {
    this.chunks.push(pcm);
    this.length += pcm.length;
  }

  get durationMs(): number {
    return (this.length / this.sampleRate) * 1000;
  }

  frames(): Float32Array {
    const out = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}
