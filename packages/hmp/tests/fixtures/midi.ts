function vlq(n: number): number[] {
  const out = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    out.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return out;
}

export function tinyMidi(opts: { truncated?: boolean; lyrics?: boolean; texts?: number } = {}): Uint8Array {
  const events: number[] = [];
  const push = (bytes: number[]) => events.push(...bytes);
  if (opts.lyrics) {
    const t = Buffer.from("LaLaLa karaoke words here ".repeat(5), "utf8");
    push([0x00, 0xff, 0x05, ...vlq(t.length), ...t]);
  }
  for (let i = 0; i < (opts.texts ?? 0); i++) {
    const t = Buffer.from(`line ${i} of many words`, "utf8");
    push([0x00, 0xff, 0x01, ...vlq(t.length), ...t]);
  }
  push([0x00, 0xff, 0x2f, 0x00]); // end of track
  const track = Buffer.concat([Buffer.from("MTrk"), u32(events.length), Buffer.from(events)]);
  const header = Buffer.concat([Buffer.from("MThd"), u32(6), Buffer.from([0, 0, 0, 1, 0, 96])]);
  const full = Buffer.concat([header, track]);
  return new Uint8Array(opts.truncated ? full.subarray(0, full.length - 5) : full);
}
function u32(n: number): Buffer { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }

export function midiFromEvents(events: number[]): Uint8Array {
  const track = Buffer.concat([Buffer.from("MTrk"), u32(events.length), Buffer.from(events)]);
  const header = Buffer.concat([Buffer.from("MThd"), u32(6), Buffer.from([0, 0, 0, 1, 0, 96])]);
  return new Uint8Array(Buffer.concat([header, track]));
}

export function mtrkChunk(events: number[]): Uint8Array {
  return new Uint8Array(Buffer.concat([Buffer.from("MTrk"), u32(events.length), Buffer.from(events)]));
}

export function midiWithChunks(headerData: number[], chunks: Uint8Array[]): Uint8Array {
  const header = Buffer.concat([Buffer.from("MThd"), u32(headerData.length), Buffer.from(headerData)]);
  const full = Buffer.concat([header, ...chunks.map((c) => Buffer.from(c))]);
  return new Uint8Array(full);
}

export function midiWithTexts(count: number, text: string): Uint8Array {
  const events: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = Buffer.from(text, "utf8");
    events.push(0x00, 0xff, 0x01, ...vlq(t.length), ...t);
  }
  events.push(0x00, 0xff, 0x2f, 0x00);
  return midiFromEvents(events);
}
