import { PendingRequests, decodeEvent, encodeCommand } from "../../src/audio/bridge";

describe("bridge codec", () => {
  it("round-trips a command", () => {
    const raw = encodeCommand({ id: 3, type: "seek", sec: 12.5 });
    expect(JSON.parse(raw)).toEqual({ id: 3, type: "seek", sec: 12.5 });
  });

  it("decodes an event and rejects junk", () => {
    expect(decodeEvent('{"type":"progress","sec":1.5}')).toEqual({ type: "progress", sec: 1.5 });
    expect(decodeEvent("not json")).toBeNull();
    expect(decodeEvent('{"nope":1}')).toBeNull();
  });
});

describe("PendingRequests", () => {
  it("resolves a waited id and ignores unknown ids", async () => {
    const pending = new PendingRequests();
    const id = pending.nextId();
    const promise = pending.add(id);
    pending.settle(999);
    pending.settle(id);
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects a waited id and rejects all on teardown", async () => {
    const pending = new PendingRequests();
    const a = pending.nextId();
    const pa = pending.add(a);
    pending.settle(a, new Error("boom"));
    await expect(pa).rejects.toThrow("boom");

    const b = pending.nextId();
    const pb = pending.add(b);
    pending.rejectAll(new Error("disposed"));
    await expect(pb).rejects.toThrow("disposed");
  });
});
