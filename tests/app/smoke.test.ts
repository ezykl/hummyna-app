import { HEADER_SIZE, openHmp, parseLyrics } from "@hummina/hmp";

describe("app shell", () => {
  it("resolves the workspace reader package", () => {
    expect(HEADER_SIZE).toBe(16);
    expect(typeof openHmp).toBe("function");
    expect(typeof parseLyrics).toBe("function");
  });
});
