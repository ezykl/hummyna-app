export interface InflateAdapter {
  rawInflate(data: Uint8Array): Promise<Uint8Array>;
}

export const webInflateAdapter: InflateAdapter = {
  async rawInflate(data: Uint8Array): Promise<Uint8Array> {
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    void writer.write(data as unknown as BufferSource);
    void writer.close();
    const chunks: Uint8Array[] = [];
    const reader = ds.readable.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    const total = chunks.reduce((n, c) => n + c.length, 0);
    if (total === 0) throw new Error("empty inflate output");
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) {
      out.set(c, o);
      o += c.length;
    }
    return out;
  },
};
