import type { ByteSource } from "@hummyna/hmp";

const mockBytes = new Uint8Array(100).map((_, i) => i);
const mockHandle = {
  offset: 0,
  closed: false,
  readBytes: jest.fn(async (length: number): Promise<Uint8Array> => {
    await Promise.resolve();
    return mockBytes.subarray(mockHandle.offset, mockHandle.offset + length);
  }),
  close: jest.fn(() => {
    mockHandle.closed = true;
  }),
};

jest.mock("expo-file-system", () => ({
  FileMode: { ReadOnly: "r" },
  File: class MockFile {
    size = mockBytes.length;
    uri: string;
    constructor(value: string) {
      this.uri = value;
    }
    open() {
      return mockHandle;
    }
  },
}));

import { clampRead, fileByteSource } from "../../src/platform/file-byte-source";

beforeEach(() => {
  mockHandle.offset = 0;
  mockHandle.closed = false;
  mockHandle.readBytes.mockClear();
  mockHandle.close.mockClear();
});

describe("clampRead", () => {
  it("passes through in-range reads", () => {
    expect(clampRead(0, 16, 100)).toEqual({ offset: 0, length: 16 });
    expect(clampRead(10, 20, 100)).toEqual({ offset: 10, length: 20 });
  });

  it("clamps the tail read to the file size", () => {
    expect(clampRead(90, 20, 100)).toEqual({ offset: 90, length: 10 });
  });

  it("returns an empty read at or past EOF", () => {
    expect(clampRead(100, 5, 100).length).toBe(0);
    expect(clampRead(120, 5, 100).length).toBe(0);
  });

  it("clamps a negative offset to zero (interval-preserving)", () => {
    expect(clampRead(-5, 10, 100)).toEqual({ offset: 0, length: 5 });
  });
});

describe("fileByteSource", () => {
  it("reports the file size and reads an exact slice", async () => {
    const src: ByteSource = await fileByteSource("file:///library.hmp");
    expect(src.size).toBe(100);
    const out = await src.read(10, 20);
    expect(Array.from(out)).toEqual(Array.from(mockBytes.subarray(10, 30)));
  });

  it("returns empty bytes at EOF without touching the handle", async () => {
    const src = await fileByteSource("file:///library.hmp");
    const out = await src.read(100, 8);
    expect(out.length).toBe(0);
    expect(mockHandle.readBytes).not.toHaveBeenCalled();
  });

  it("serializes concurrent reads so overlapping offsets do not interleave", async () => {
    const src = await fileByteSource("file:///library.hmp");
    const [a, b] = await Promise.all([src.read(0, 10), src.read(50, 10)]);
    expect(Array.from(a)).toEqual(Array.from(mockBytes.subarray(0, 10)));
    expect(Array.from(b)).toEqual(Array.from(mockBytes.subarray(50, 60)));
  });
});
