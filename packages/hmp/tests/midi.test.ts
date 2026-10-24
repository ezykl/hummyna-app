import { describe, expect, it } from "vitest";
import { hasLyrics, hasMidiMagic, parseLyrics, probeStructure } from "../src/midi";
import { midiFromEvents, midiWithChunks, midiWithTexts, mtrkChunk, tinyMidi } from "./fixtures/midi";

describe("midi probes", () => {
  it("accepts a valid tiny midi", () => {
    const m = tinyMidi();
    expect(hasMidiMagic(m)).toBe(true);
    expect(probeStructure(m).ok).toBe(true);
  });
  it("rejects truncated structure", () => {
    expect(probeStructure(tinyMidi({ truncated: true })).ok).toBe(false);
    expect(probeStructure(tinyMidi({ truncated: true })).reason).toContain("corrupt");
  });
  it("rejects non-midi", () => {
    expect(hasMidiMagic(new Uint8Array([1, 2, 3, 4]))).toBe(false);
  });
  it("detects lyric events", () => {
    expect(hasLyrics(tinyMidi({ lyrics: true }))).toBe(true);
    expect(hasLyrics(tinyMidi())).toBe(false);
  });
  it("encodes a >127-byte lyric length as a correct multi-byte VLQ", () => {
    const m = tinyMidi({ lyrics: true });
    const eventStart = 22; // MThd(14) + MTrk(4) + chunk length(4)
    expect(Array.from(m.subarray(eventStart, eventStart + 3))).toEqual([0x00, 0xff, 0x05]);
    let i = eventStart + 3;
    let length = 0;
    while (m[i] & 0x80) {
      length = (length << 7) | (m[i] & 0x7f);
      i += 1;
    }
    length = (length << 7) | (m[i] & 0x7f);
    i += 1;
    expect(length).toBeGreaterThan(127);
    const after = i + length;
    expect(Array.from(m.subarray(after, after + 4))).toEqual([0x00, 0xff, 0x2f, 0x00]);
  });
  it("accepts many text events totaling 100+ chars", () => {
    expect(hasLyrics(tinyMidi({ texts: 10 }))).toBe(true);
  });
  it("requires the AND of >=10 text events and >=100 chars", () => {
    expect(hasLyrics(tinyMidi({ texts: 9 }))).toBe(false);
  });
  it("walks channel events with running status before a lyric", () => {
    const m = midiFromEvents([
      0x00, 0x90, 0x40, 0x60, // note on sets running status
      0x00, 0x41, 0x60, // running-status note on (no status byte)
      0x00, 0xff, 0x05, 0x01, 0x41, // lyric "A"
      0x00, 0xff, 0x2f, 0x00,
    ]);
    expect(hasLyrics(m)).toBe(true);
  });
  it("rejects non-MThd data of sufficient length", () => {
    expect(probeStructure(new Uint8Array(64)).ok).toBe(false);
    expect(probeStructure(new Uint8Array(64)).reason).toContain("corrupt");
  });
  it("rejects an unknown (non-MTrk) chunk after MThd", () => {
    const unknown = new Uint8Array([...Buffer.from("XFDF"), 0, 0, 0, 4, 1, 2, 3, 4]);
    const m = midiWithChunks([0, 0, 0, 1, 0, 96], [unknown]);
    expect(probeStructure(m).ok).toBe(false);
  });
  it("rejects a MThd header chunk length under 6", () => {
    const m = midiWithChunks([0, 0, 0, 1, 0], [mtrkChunk([0x00, 0xff, 0x2f, 0x00])]);
    expect(probeStructure(m).ok).toBe(false);
  });
  it("rejects a header declaring zero tracks", () => {
    const m = midiWithChunks([0, 0, 0, 0, 0, 96], []);
    expect(probeStructure(m).ok).toBe(false);
  });
  it("rejects a header claiming more tracks than are present", () => {
    const m = midiWithChunks([0, 0, 0, 2, 0, 96], [mtrkChunk([0x00, 0xff, 0x2f, 0x00])]);
    expect(probeStructure(m).ok).toBe(false);
  });
  it("rejects >=10 text events totaling under 100 chars", () => {
    expect(hasLyrics(midiWithTexts(10, "ab"))).toBe(false);
  });
});

describe("parseLyrics", () => {
  it("emits timed lyric lines using the default tempo (500000 us/quarter)", () => {
    // header division 96; 0x60 = 96 ticks = one quarter = 500ms
    const m = midiFromEvents([
      0x00, 0xff, 0x05, 0x01, 0x41, // "A" at tick 0
      0x60, 0xff, 0x05, 0x01, 0x42, // "B" at tick 96
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const lines = parseLyrics(m);
    expect(lines.map((l) => l.text)).toEqual(["A", "B"]);
    expect(lines[0].timeMs).toBeCloseTo(0, 5);
    expect(lines[1].timeMs).toBeCloseTo(500, 5);
  });

  it("respects a setTempo event", () => {
    // tempo 1000000 us/quarter => 96 ticks = 1000ms
    const m = midiFromEvents([
      0x00, 0xff, 0x51, 0x03, 0x0f, 0x42, 0x40,
      0x60, 0xff, 0x05, 0x01, 0x41,
      0x00, 0xff, 0x2f, 0x00,
    ]);
    const lines = parseLyrics(m);
    expect(lines).toHaveLength(1);
    expect(lines[0].timeMs).toBeCloseTo(1000, 5);
  });

  it("returns [] for a non-lyric MIDI", () => {
    expect(parseLyrics(tinyMidi())).toEqual([]);
  });
});
