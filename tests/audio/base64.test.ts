import { toBase64 } from "../../src/audio/base64";

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe("toBase64", () => {
  it("matches known vectors (all length%3 remainders)", () => {
    expect(toBase64(enc(""))).toBe("");
    expect(toBase64(enc("M"))).toBe("TQ==");
    expect(toBase64(enc("Ma"))).toBe("TWE=");
    expect(toBase64(enc("Man"))).toBe("TWFu");
    expect(toBase64(enc("Hello, world!"))).toBe("SGVsbG8sIHdvcmxkIQ==");
  });

  it("agrees with the platform encoder for a large buffer", () => {
    const bytes = new Uint8Array(1000).map((_, i) => (i * 37 + 11) & 0xff);
    expect(toBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});
