import type { ScoreResult } from "./score";

export interface StoredResult {
  result: ScoreResult;
  funMode: boolean;
}

let last: StoredResult | null = null;

export function setLastResult(result: ScoreResult, opts: { funMode?: boolean } = {}): void {
  last = { result, funMode: opts.funMode ?? false };
}

export function getLastResult(): StoredResult | null {
  return last;
}
