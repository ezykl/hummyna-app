import type { NoteScore, ScoreResult } from "./score";

function gradeFor(accuracy: number): string {
  if (accuracy >= 0.9) return "S";
  if (accuracy >= 0.8) return "A";
  if (accuracy >= 0.65) return "B";
  if (accuracy >= 0.5) return "C";
  return "D";
}

/** Deterministic random result for the opt-in, clearly-labelled fun mode. */
export function randomScore(noteCount: number, seed: number): ScoreResult {
  let state = seed >>> 0;
  const rand = (): number => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
  const notes: NoteScore[] = Array.from({ length: noteCount }, (_, index) => ({
    note: { startMs: index * 500, endMs: index * 500 + 400, midi: 60 },
    hit: rand() > 0.35,
    cents: 0,
  }));
  const hitCount = notes.filter((n) => n.hit).length;
  const accuracy = noteCount > 0 ? hitCount / noteCount : 0;
  let bestStreak = 0;
  let streak = 0;
  for (const n of notes) {
    streak = n.hit ? streak + 1 : 0;
    if (streak > bestStreak) bestStreak = streak;
  }
  return { noteCount, hitCount, accuracy, bestStreak, grade: gradeFor(accuracy), notes, lines: [] };
}
