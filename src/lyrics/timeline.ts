import type { LyricLine } from "@hummyna/hmp";

/** Index of the line active at `timeMs` (-1 before the first line or when empty). */
export function currentLineIndex(lines: LyricLine[], timeMs: number): number {
  if (lines.length === 0 || timeMs < lines[0].timeMs) return -1;
  let lo = 0;
  let hi = lines.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].timeMs <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** Progress within the current line, 0..1 (last line or a zero-length span -> 0). */
export function lineProgress(line: LyricLine, next: LyricLine | undefined, timeMs: number): number {
  if (!next || next.timeMs <= line.timeMs) return 0;
  const p = (timeMs - line.timeMs) / (next.timeMs - line.timeMs);
  return Math.max(0, Math.min(1, p));
}
