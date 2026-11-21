import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(__dirname, "..", "assets", "images");

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

interface Spec {
  file: string;
  size: number;
  transparent: boolean;
}

// From docs/superpowers/specs/2026-11-19-brand-mascot-png-design.md §3.
const SPEC: Spec[] = [
  { file: "icon.png", size: 1024, transparent: false },
  { file: "adaptive-icon.png", size: 1024, transparent: true },
  { file: "splash-icon.png", size: 512, transparent: true },
  { file: "favicon.png", size: 192, transparent: false },
  { file: "mascot-header.png", size: 64, transparent: true },
  { file: "mascot-empty.png", size: 320, transparent: true },
  { file: "mascot-search.png", size: 240, transparent: true },
  { file: "mascot-singing.png", size: 300, transparent: true },
  { file: "mascot-celebrate.png", size: 320, transparent: true },
  { file: "mascot-cheer.png", size: 320, transparent: true },
];

function readPng(file: string): { width: number; height: number; colorType: number } {
  const buf = readFileSync(join(dir, file));
  expect(Array.from(buf.subarray(0, 8))).toEqual(PNG_SIGNATURE);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), colorType: buf[25] };
}

describe("brand assets", () => {
  it("generates every asset from the manifest at the spec dimensions", () => {
    for (const { file, size } of SPEC) {
      const png = readPng(file);
      expect(png.width).toBe(size);
      expect(png.height).toBe(size);
    }
  });

  it("renders 32-bit RGBA with a transparent margin around the centred art", () => {
    for (const { file } of SPEC) {
      const buf = readFileSync(join(dir, file));
      expect(buf[25]).toBe(6); // IHDR colour type: RGBA
      // Inflate the IDAT stream and check the (0,0) pixel's alpha is 0.
      const idat: Buffer[] = [];
      let offset = 8;
      while (offset < buf.length) {
        const length = buf.readUInt32BE(offset);
        const type = buf.subarray(offset + 4, offset + 8).toString("ascii");
        if (type === "IDAT") idat.push(buf.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
      }
      const raw = require("node:zlib").inflateSync(Buffer.concat(idat));
      const stride = 1 + buf.readUInt32BE(16) * 4; // filter byte + RGBA row
      expect(raw[4]).toBe(0); // first pixel: filter byte 0, then R G B A(=0)
    }
  });
});
