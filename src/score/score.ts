import type { LyricLine, ReferenceNote } from "@hummyna/hmp";
import type { DetectedFrame } from "./pitch";

export interface NoteScore {
  note: ReferenceNote;
  hit: boolean;
  cents: number;
}

export interface LineScore {
  startMs: number;
  endMs: number;
  total: number;
  hit: number;
  accuracy: number;
}

export interface ScoreResult {
  noteCount: number;
  hitCount: number;
  accuracy: number;
  bestStreak: number;
  grade: string;
  notes: NoteScore[];
  lines: LineScore[];
}

export interface ScoreOptions {
  offsetMs?: number;
  centTolerance?: number;
  timingToleranceMs?: number;
  lines?: LyricLine[];
}

function gradeFor(accuracy: number): string {
  if (accuracy >= 0.9) return "S";
  if (accuracy >= 0.8) return "A";
  if (accuracy >= 0.65) return "B";
  if (accuracy >= 0.5) return "C";
  return "D";
}

function groupLines(notes: NoteScore[], lines: LyricLine[]): LineScore[] {
  return lines.map((line, index) => {
    const endMs = index + 1 < lines.length ? lines[index + 1].timeMs : Number.POSITIVE_INFINITY;
    const inLine = notes.filter((n) => n.note.startMs >= line.timeMs && n.note.startMs < endMs);
    const hit = inLine.filter((n) => n.hit).length;
    const total = inLine.length;
    return {
      startMs: line.timeMs,
      endMs: Number.isFinite(endMs) ? endMs : total > 0 ? inLine[total - 1].note.endMs : line.timeMs,
      total,
      hit,
      accuracy: total > 0 ? hit / total : 0,
    };
  });
}

export function scorePerformance(
  reference: ReferenceNote[],
  detected: DetectedFrame[],
  opts: ScoreOptions = {},
): ScoreResult {
  const offsetMs = opts.offsetMs ?? 0;
  const centTolerance = opts.centTolerance ?? 50;
  const timingToleranceMs = opts.timingToleranceMs ?? 150;

  const notes: NoteScore[] = reference.map((note) => {
    const from = note.startMs - timingToleranceMs + offsetMs;
    const to = note.endMs + timingToleranceMs + offsetMs;
    let best: DetectedFrame | null = null;
    for (const f of detected) {
      if (f.timeMs < from || f.timeMs > to) continue;
      if (f.midi !== note.midi) continue;
      if (Math.abs(f.cents) > centTolerance) continue;
      if (!best || f.clarity > best.clarity) best = f;
    }
    return { note, hit: best !== null, cents: best ? best.cents : 0 };
  });

  const hitCount = notes.filter((n) => n.hit).length;
  const noteCount = notes.length;
  const accuracy = noteCount > 0 ? hitCount / noteCount : 0;

  let bestStreak = 0;
  let streak = 0;
  for (const n of notes) {
    streak = n.hit ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }

  return {
    noteCount,
    hitCount,
    accuracy,
    bestStreak,
    grade: gradeFor(accuracy),
    notes,
    lines: groupLines(notes, opts.lines ?? []),
  };
}
