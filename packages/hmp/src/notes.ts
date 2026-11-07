import { matches, readU16, readU32, readVlq } from "./midi";

const MTHD = [0x4d, 0x54, 0x68, 0x64];
const MTRK = [0x4d, 0x54, 0x72, 0x6b];

export interface NoteEvent {
  startMs: number;
  endMs: number;
  midi: number;
  velocity: number;
  track: number;
}

export interface ReferenceNote {
  startMs: number;
  endMs: number;
  midi: number;
}

interface TickEvent {
  tick: number;
  kind: "tempo" | "lyric" | "noteon" | "noteoff";
  a?: number;
  b?: number;
}

interface Tempo {
  tick: number;
  usPerQuarter: number;
}

function scanTrack(midi: Uint8Array, from: number, to: number, onEvent: (e: TickEvent) => void): void {
  let pos = from;
  let running = -1;
  let tick = 0;
  while (pos < to) {
    const delta = readVlq(midi, pos, to);
    if (!delta) break;
    pos = delta.pos;
    tick += delta.value;
    if (pos >= to) break;
    let status: number;
    if (midi[pos] & 0x80) {
      status = midi[pos++];
      if (status >= 0xf0) running = -1;
      else running = status;
    } else {
      status = running;
      if (status < 0) break;
    }
    if (status === 0xff) {
      if (pos >= to) break;
      const meta = midi[pos++];
      const len = readVlq(midi, pos, to);
      if (!len) break;
      pos = len.pos;
      if (pos + len.value > to) break;
      if (meta === 0x51 && len.value === 3) {
        onEvent({ tick, kind: "tempo", a: (midi[pos] << 16) | (midi[pos + 1] << 8) | midi[pos + 2] });
      } else if (meta === 0x05) {
        onEvent({ tick, kind: "lyric" });
      } else if (meta === 0x2f) {
        break;
      }
      pos += len.value;
    } else if (status === 0xf0 || status === 0xf7) {
      const len = readVlq(midi, pos, to);
      if (!len || len.pos + len.value > to) break;
      pos = len.pos + len.value;
    } else {
      const hi = status >> 4;
      const dataLen = hi === 0xc || hi === 0xd ? 1 : 2;
      if (pos + dataLen > to) break;
      if (hi === 0x9) onEvent({ tick, kind: midi[pos + 1] > 0 ? "noteon" : "noteoff", a: midi[pos], b: midi[pos + 1] });
      else if (hi === 0x8) onEvent({ tick, kind: "noteoff", a: midi[pos], b: midi[pos + 1] });
      pos += dataLen;
    }
  }
}

function eachTrack(midi: Uint8Array, fn: (from: number, to: number, index: number) => void): void {
  const headerLen = readU32(midi, 4);
  let pos = 8 + headerLen;
  let index = 0;
  while (pos + 8 <= midi.length && matches(midi, pos, MTRK)) {
    const len = readU32(midi, pos + 4);
    const from = pos + 8;
    const to = Math.min(from + len, midi.length);
    fn(from, to, index);
    if (from + len > midi.length) break;
    pos = from + len;
    index += 1;
  }
}

function buildTempos(midi: Uint8Array): Tempo[] {
  const tempos: Tempo[] = [{ tick: 0, usPerQuarter: 500000 }];
  eachTrack(midi, (from, to) => {
    scanTrack(midi, from, to, (e) => {
      if (e.kind === "tempo") tempos.push({ tick: e.tick, usPerQuarter: e.a as number });
    });
  });
  tempos.sort((a, b) => a.tick - b.tick);
  return tempos;
}

function tickToMs(tick: number, tempos: Tempo[], division: number): number {
  let ms = 0;
  let lastTick = 0;
  let us = 500000;
  for (const t of tempos) {
    if (t.tick >= tick) break;
    ms += ((t.tick - lastTick) * us) / division / 1000;
    lastTick = t.tick;
    us = t.usPerQuarter;
  }
  return ms + ((tick - lastTick) * us) / division / 1000;
}

function lyricTrackIndex(midi: Uint8Array): number {
  let found = -1;
  eachTrack(midi, (from, to, index) => {
    if (found >= 0) return;
    scanTrack(midi, from, to, (e) => {
      if (e.kind === "lyric") found = index;
    });
  });
  return found;
}

function monophonise(notes: NoteEvent[]): ReferenceNote[] {
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs || b.midi - a.midi);
  const out: ReferenceNote[] = [];
  for (const n of sorted) {
    const prev = out[out.length - 1];
    if (prev && n.startMs < prev.endMs) {
      if (n.midi > prev.midi) {
        prev.endMs = Math.max(prev.startMs, n.startMs);
        out.push({ startMs: n.startMs, endMs: n.endMs, midi: n.midi });
      }
    } else {
      out.push({ startMs: n.startMs, endMs: n.endMs, midi: n.midi });
    }
  }
  return out.filter((r) => r.endMs > r.startMs);
}

export function parseNotes(midi: Uint8Array): NoteEvent[] {
  if (midi.length < 14 || !matches(midi, 0, MTHD)) return [];
  const headerLen = readU32(midi, 4);
  if (headerLen < 6) return [];
  const division = readU16(midi, 12) || 96;
  const tempos = buildTempos(midi);

  const raw: { track: number; tickOn: number; tickOff: number; midi: number; velocity: number }[] = [];
  eachTrack(midi, (from, to, track) => {
    const active = new Map<number, { tick: number; velocity: number }>();
    scanTrack(midi, from, to, (e) => {
      if (e.kind === "noteon") {
        active.set(e.a as number, { tick: e.tick, velocity: e.b as number });
      } else if (e.kind === "noteoff") {
        const key = e.a as number;
        const on = active.get(key);
        if (on) {
          active.delete(key);
          raw.push({ track, tickOn: on.tick, tickOff: e.tick, midi: key, velocity: on.velocity });
        }
      }
    });
  });

  return raw
    .map((n) => ({
      track: n.track,
      midi: n.midi,
      velocity: n.velocity,
      startMs: tickToMs(n.tickOn, tempos, division),
      endMs: tickToMs(n.tickOff, tempos, division),
    }))
    .filter((n) => n.endMs > n.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.midi - b.midi);
}

export function extractMelody(midi: Uint8Array): ReferenceNote[] {
  const notes = parseNotes(midi);
  if (notes.length === 0) return [];
  const lyric = lyricTrackIndex(midi);
  const chosen = lyric >= 0 && notes.some((n) => n.track === lyric) ? notes.filter((n) => n.track === lyric) : notes;
  return monophonise(chosen.length > 0 ? chosen : notes);
}
