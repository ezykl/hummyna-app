import { describe, expect, it } from "vitest";
import { HMP_PACKAGE } from "../src/index";

describe("hmp package", () => {
  it("is set up", () => {
    expect(HMP_PACKAGE).toBe("@hummina/hmp");
  });
});
