import mysterySubjectsJson from "@/data/mystery-subjects.json";

export type MysteryCategory = "world" | "science" | "mystery" | "past" | "culture";

export const MYSTERY_CATEGORY_LABEL: Record<MysteryCategory, string> = {
  world: "Identify the World",
  science: "Identify the Science",
  mystery: "Identify the Mystery",
  past: "Identify the Past",
  culture: "Identify the Culture",
};

export const MYSTERY_CATEGORY_EMOJI: Record<MysteryCategory, string> = {
  world: "🌍",
  science: "🔬",
  mystery: "🔎",
  past: "🏺",
  culture: "🍜",
};

export interface MysterySubject {
  id: string;
  level: 1 | 2 | 3;
  category: MysteryCategory;
  // What image to curate/source for this subject — a content-authoring aid
  // now (images are curated, not AI-generated; see mystery-sync.server.ts),
  // not fed into a live generation prompt anymore.
  promptHint: string;
  options: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
}

export const MYSTERY_SUBJECTS = mysterySubjectsJson as MysterySubject[];

export const POINTS_BY_LEVEL: Record<1 | 2 | 3, number> = { 1: 10, 2: 20, 3: 30 };

/** Extra points for guessing correctly before the image finishes revealing —
 * on top of POINTS_BY_LEVEL, scaled by how much blur was still left. */
export const REVEAL_BONUS_BY_LEVEL: Record<1 | 2 | 3, number> = { 1: 5, 2: 10, 3: 15 };

/** Seconds for the mystery image to go from fully blurred to fully sharp. */
export const REVEAL_DURATION_SECONDS = 8;

export interface MysteryStreakState {
  level: 1 | 2 | 3;
  correctStreak: number;
  wrongStreak: number;
}

/**
 * Adaptive difficulty: two correct answers in a row bump the level up, two
 * wrong answers in a row bump it down. Both streak counters reset on any
 * answer that isn't extending them, and reset to 0 once they trigger a move.
 */
export function nextMysteryState(state: MysteryStreakState, wasCorrect: boolean): MysteryStreakState {
  if (wasCorrect) {
    const correctStreak = state.correctStreak + 1;
    if (correctStreak >= 2) {
      return { level: Math.min(3, state.level + 1) as 1 | 2 | 3, correctStreak: 0, wrongStreak: 0 };
    }
    return { level: state.level, correctStreak, wrongStreak: 0 };
  }
  const wrongStreak = state.wrongStreak + 1;
  if (wrongStreak >= 2) {
    return { level: Math.max(1, state.level - 1) as 1 | 2 | 3, correctStreak: 0, wrongStreak: 0 };
  }
  return { level: state.level, correctStreak: 0, wrongStreak };
}

export function pickMysterySubject(level: 1 | 2 | 3, excludeIds: string[]): MysterySubject {
  const pool = MYSTERY_SUBJECTS.filter((s) => s.level === level && !excludeIds.includes(s.id));
  const source = pool.length > 0 ? pool : MYSTERY_SUBJECTS.filter((s) => s.level === level);
  return source[Math.floor(Math.random() * source.length)];
}

/** Shuffle the 4 options, returning the new order and the new correct index. */
export function shuffleOptions(subject: MysterySubject): { options: string[]; correctIndex: number } {
  const indexed = subject.options.map((text, i) => ({ text, isCorrect: i === subject.correctIndex }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
  }
  return {
    options: indexed.map((o) => o.text),
    correctIndex: indexed.findIndex((o) => o.isCorrect),
  };
}
