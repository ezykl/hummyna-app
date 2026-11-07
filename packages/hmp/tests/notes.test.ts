import { describe, expect, it } from "vitest";
import { extractMelody, parseNotes } from "../src/notes";
import { midiFromEvents } from "./fixtures/midi";

// Header division = 96; default tempo 500000 us/quarter -> 96 ticks = 500 ms.
const twoNotes = () =>
  midiFromEvents([
    0x00, 0x90, 0x45, 0x60, // note on 69, vel 96, tick 0
    0x60, 0x80, 0x45, 0x40, // +96 ticks: note off 69 (tick 96 -> 500 ms)
    0x00, 0x90, 0x48, 0x60, // note on 72 at tick 96
    0x60, 0x80, 0x48, 0x40, // +96: note off 72 (tick 192 -> 1000 ms)
    0x00, 0xff, 0x2f, 0x00,
  ]);

describe("parseNotes", () => {
  it("returns note events with tick->ms timing", () => {
    const notes = parseNotes(twoNotes());
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ midi: 69, startMs: 0, endMs: 500, track: 0 });
    expect(notes[1]).toMatchObject({ midi: 72, startMs: 500, endMs: 1000 });
  });

  it("returns [] for non-midi", () => {
    expect(parseNotes(new Uint8Array([1, 2, 3]))).toEqual([]);
  });
});

describe("extractMelody", () => {
  it("returns a sorted monophonic reference", () => {
    const ref = extractMelody(twoNotes());
    expect(ref.map((r) => r.midi)).toEqual([69, 72]);
    expect(ref[0].startMs).toBeLessThanOrEqual(ref[1].startMs);
  });

  it("returns [] when there are no notes", () => {
    expect(extractMelody(midiFromEvents([0x00, 0xff, 0x2f, 0x00]))).toEqual([]);
  });
});
