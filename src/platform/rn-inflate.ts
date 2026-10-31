import type { InflateAdapter } from "@hummyna/hmp";
import { inflateRaw } from "pako";

export const rnInflateAdapter: InflateAdapter = {
  async rawInflate(data: Uint8Array): Promise<Uint8Array> {
    return inflateRaw(data);
  },
};
