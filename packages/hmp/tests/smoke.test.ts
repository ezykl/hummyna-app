import { describe, expect, it } from "vitest";
import { HEADER_SIZE, openHmp, parseLyrics, webCryptoAdapter } from "../src/index";

describe("hmp package", () => {
  it("exposes the public API", () => {
    expect(HEADER_SIZE).toBe(16);
    expect(typeof openHmp).toBe("function");
    expect(typeof parseLyrics).toBe("function");
    expect(typeof webCryptoAdapter.decrypt).toBe("function");
  });
});
