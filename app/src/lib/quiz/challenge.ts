import { ALL_QUESTIONS } from "@/lib/question-bank";
import type { Question } from "@/lib/categories";
import { COMBINED_CATEGORY_RATIOS, pickWeighted } from "./ratio-sampling";

export const CHALLENGE_QUESTION_COUNT = 10;
export const CHALLENGE_INVITE_TTL_HOURS = 48;

function randomLevel(): 1 | 2 | 3 {
  return (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function generateChallengeId(): string {
  // URL-safe, short enough to read out loud, long enough not to collide.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let id = "";
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Builds one player's 10-question round from their own category pick — a
 * random difficulty per question ("difficulty should be randomized in
 * game"), ratio-weighted sampling within the category when it's a combined
 * one (#13). Each player's round is independent, built fresh from whatever
 * category *they* picked — there's no shared question set to keep in sync
 * since the two rounds are never played at the same time.
 */
export function buildChallengeRoundQuestions(categoryTags: string[]): Question[] {
  const usedIds = new Set<number>();
  const picks: Question[] = [];

  for (let i = 0; i < CHALLENGE_QUESTION_COUNT; i++) {
    const level = randomLevel();
    const pool = ALL_QUESTIONS.filter((q) => q.level === level && categoryTags.every((t) => q.subcategories.includes(t)));
    const components = categoryTags.length === 1 ? (COMBINED_CATEGORY_RATIOS[categoryTags[0]] ?? null) : null;
    const got = pickWeighted(pool, components, 1, usedIds);
    if (got[0]) {
      picks.push(got[0]);
      usedIds.add(got[0].id);
    }
  }

  // Backfill if the category came up short at some difficulty (thin source
  // data) — draw from the category at any level so the round always has 10.
  if (picks.length < CHALLENGE_QUESTION_COUNT) {
    const pool = ALL_QUESTIONS.filter((q) => !usedIds.has(q.id) && categoryTags.every((t) => q.subcategories.includes(t)));
    const backfill = shuffle(pool).slice(0, CHALLENGE_QUESTION_COUNT - picks.length);
    backfill.forEach((q) => usedIds.add(q.id));
    picks.push(...backfill);
  }

  return shuffle(picks);
}
