import { describe, expect, it } from "vitest";
import { webInflateAdapter } from "../src/adapters/inflate";

async function rawDeflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate-raw");
  const writer = cs.writable.getWriter();
  void writer.write(data as unknown as BufferSource);
  void writer.close();
  const chunks: Uint8Array[] = [];
  const reader = cs.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

describe("webInflateAdapter", () => {
  it("inflates deflate-raw bytes", async () => {
    const src = new TextEncoder().encode("karaoke ".repeat(50));
    const deflated = await rawDeflate(src);
    const out = await webInflateAdapter.rawInflate(deflated);
    expect(new TextDecoder().decode(out)).toBe("karaoke ".repeat(50));
  });
});
