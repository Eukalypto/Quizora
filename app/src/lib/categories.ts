// Tag-based category system. Categories are DERIVED from the question bank,
// never hardcoded — this file is the single source of truth for what shows
// up in any category picker (solo free play, multiplayer round setup).

export interface Question {
  id: number;
  subcategories: string[];
  level: 1 | 2 | 3;
  question: string;
  answers: [string, string, string, string];
  correct: 0 | 1 | 2 | 3;
  media_url: string | null;
}

export type Difficulty = "easy" | "medium" | "hard";

// Backward-compat with the reference build's `d: "easy"|"medium"|"hard"` convention.
export function levelToDifficulty(level: 1 | 2 | 3): Difficulty {
  return level === 1 ? "easy" : level === 2 ? "medium" : "hard";
}

export interface Category {
  /** Stable identity for URLs/selection state — slug of the tag combo. */
  key: string;
  label: string;
  tags: string[];
  matchMode: "all";
  kind: "top-level" | "combo" | "modifier";
}

export function questionMatchesCategory(question: Question, category: Pick<Category, "tags">): boolean {
  return category.tags.every((tag) => question.subcategories.includes(tag));
}

export function getQuestionsForCategory(questions: Question[], category: Pick<Category, "tags">): Question[] {
  return questions.filter((q) => questionMatchesCategory(q, category));
}
