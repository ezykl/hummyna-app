const REJECT = "corrupt MIDI (truncated/unreadable structure)";

const MTHD = [0x4d, 0x54, 0x68, 0x64]; // "MThd"
const MTRK = [0x4d, 0x54, 0x72, 0x6b]; // "MTrk"

const textDecoder = new TextDecoder();

function readU32(b: Uint8Array, off: number): number {
  return ((b[off] << 24) | (b[off + 1] << 16) | (b[off + 2] << 8) | b[off + 3]) >>> 0;
}

function readU16(b: Uint8Array, off: number): number {
  return (b[off] << 8) | b[off + 1];
}

function matches(b: Uint8Array, off: number, sig: number[]): boolean {
  for (let i = 0; i < 4; i++) if (b[off + i] !== sig[i]) return false;
  return true;
}

export function hasMidiMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && matches(bytes, 0, MTHD);
}

export function probeStructure(bytes: Uint8Array): { ok: boolean; reason?: string } {
  if (bytes.length < 14 || !hasMidiMagic(bytes)) return { ok: false, reason: REJECT };
  const headerLen = readU32(bytes, 4);
  if (headerLen < 6) return { ok: false, reason: REJECT };
  const ntrks = readU16(bytes, 10);
  if (ntrks < 1) return { ok: false, reason: REJECT };
  let pos = 8 + headerLen;
  if (pos > bytes.length) return { ok: false, reason: REJECT };
  let tracks = 0;
  while (pos < bytes.length) {
    if (pos + 8 > bytes.length || !matches(bytes, pos, MTRK)) return { ok: false, reason: REJECT };
    const len = readU32(bytes, pos + 4);
    if (pos + 8 + len > bytes.length) return { ok: false, reason: REJECT };
    pos += 8 + len;
    tracks++;
  }
  if (tracks < ntrks) return { ok: false, reason: REJECT };
  return { ok: true };
}

interface Vlq {
  pos: number;
  value: number;
}

function readVlq(b: Uint8Array, pos: number, to: number): Vlq | null {
  let value = 0;
  for (let count = 0; pos < to; count++) {
    const byte = b[pos++];
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { pos, value };
    if (count >= 3) return null;
  }
  return null;
}

interface TrackScan {
  lyric: boolean;
  textEvents: number;
  textChars: number;
}

function scanTrack(b: Uint8Array, from: number, to: number): TrackScan {
  const out: TrackScan = { lyric: false, textEvents: 0, textChars: 0 };
  let pos = from;
  let running = -1;
  while (pos < to) {
    const delta = readVlq(b, pos, to);
    if (!delta) break;
    pos = delta.pos;
    if (pos >= to) break;
    let status: number;
    if (b[pos] & 0x80) {
      status = b[pos++];
      if (status >= 0xf0) running = -1; // sysex/meta cancel running status
      else running = status;
    } else {
      status = running;
      if (status < 0) break; // malformed: no running status to inherit
    }
    if (status === 0xff) {
      if (pos >= to) break;
      const meta = b[pos++];
      if (meta === 0x05) out.lyric = true; // marker itself is the signal
      const len = readVlq(b, pos, to);
      if (!len) break;
      pos = len.pos;
      if (meta === 0x01) {
        if (pos + len.value > to) break;
        out.textEvents++;
        out.textChars += textDecoder.decode(b.subarray(pos, pos + len.value)).length;
      } else if (meta === 0x2f) {
        break; // end of track
      }
      pos += len.value; // may pass `to`: loop then exits
    } else if (status === 0xf0 || status === 0xf7) {
      const len = readVlq(b, pos, to);
      if (!len || len.pos + len.value > to) break;
      pos = len.pos + len.value;
    } else {
      const hi = status >> 4;
      const dataLen = hi === 0xc || hi === 0xd ? 1 : 2;
      if (pos + dataLen > to) break;
      pos += dataLen;
    }
  }
  return out;
}

export function hasLyrics(bytes: Uint8Array): boolean {
  if (bytes.length < 14 || !hasMidiMagic(bytes)) return false;
  const headerLen = readU32(bytes, 4);
  if (headerLen < 6) return false;
  let pos = 8 + headerLen;
  if (pos > bytes.length) return false;
  let textEvents = 0;
  let textChars = 0;
  while (pos + 8 <= bytes.length) {
    if (!matches(bytes, pos, MTRK)) break;
    const len = readU32(bytes, pos + 4);
    const dataStart = pos + 8;
    const end = Math.min(dataStart + len, bytes.length);
    const scan = scanTrack(bytes, dataStart, end);
    if (scan.lyric) return true;
    textEvents += scan.textEvents;
    textChars += scan.textChars;
    if (textEvents >= 10 && textChars >= 100) return true;
    if (dataStart + len > bytes.length) break; // truncated track: best-effort scan only
    pos = dataStart + len;
  }
  return textEvents >= 10 && textChars >= 100;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}

interface TimedEvent {
  tick: number;
  kind: "tempo" | "lyric";
  tempo?: number;
  text?: string;
}

function scanTimedEvents(b: Uint8Array, from: number, to: number, out: TimedEvent[]): void {
  let pos = from;
  let running = -1;
  let tick = 0;
  while (pos < to) {
    const delta = readVlq(b, pos, to);
    if (!delta) break;
    pos = delta.pos;
    tick += delta.value;
    if (pos >= to) break;
    let status: number;
    if (b[pos] & 0x80) {
      status = b[pos++];
      if (status >= 0xf0) running = -1;
      else running = status;
    } else {
      status = running;
      if (status < 0) break;
    }
    if (status === 0xff) {
      if (pos >= to) break;
      const meta = b[pos++];
      const len = readVlq(b, pos, to);
      if (!len) break;
      pos = len.pos;
      if (pos + len.value > to) break;
      if (meta === 0x51 && len.value === 3) {
        const tempo = (b[pos] << 16) | (b[pos + 1] << 8) | b[pos + 2];
        out.push({ tick, kind: "tempo", tempo });
      } else if (meta === 0x05) {
        out.push({ tick, kind: "lyric", text: textDecoder.decode(b.subarray(pos, pos + len.value)) });
      } else if (meta === 0x2f) {
        break;
      }
      pos += len.value;
    } else if (status === 0xf0 || status === 0xf7) {
      const len = readVlq(b, pos, to);
      if (!len || len.pos + len.value > to) break;
      pos = len.pos + len.value;
    } else {
      const hi = status >> 4;
      const dataLen = hi === 0xc || hi === 0xd ? 1 : 2;
      if (pos + dataLen > to) break;
      pos += dataLen;
    }
  }
}

export function parseLyrics(midi: Uint8Array): LyricLine[] {
  if (midi.length < 14 || !hasMidiMagic(midi)) return [];
  const headerLen = readU32(midi, 4);
  if (headerLen < 6) return [];
  const division = readU16(midi, 12) || 96;

  const events: TimedEvent[] = [];
  let pos = 8 + headerLen;
  while (pos + 8 <= midi.length) {
    if (!matches(midi, pos, MTRK)) break;
    const len = readU32(midi, pos + 4);
    const dataStart = pos + 8;
    const end = Math.min(dataStart + len, midi.length);
    scanTimedEvents(midi, dataStart, end, events);
    if (dataStart + len > midi.length) break;
    pos = dataStart + len;
  }

  events.sort((a, b) => a.tick - b.tick);

  const lines: LyricLine[] = [];
  let tempo = 500_000; // microseconds per quarter note
  let lastTick = 0;
  let ms = 0;
  for (const e of events) {
    ms += ((e.tick - lastTick) * tempo) / division / 1000;
    lastTick = e.tick;
    if (e.kind === "tempo") tempo = e.tempo as number;
    else lines.push({ timeMs: ms, text: e.text as string });
  }
  return lines;
}
