import { ALL_QUESTIONS, TAXONOMY } from "@/lib/question-bank";
import type { Question } from "@/lib/categories";
import { COMBINED_CATEGORY_RATIOS, pickWeighted } from "./ratio-sampling";
import { isoWeek, seededShuffle } from "./scoring";

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Daily/Weekly are both 12 questions total: 10 drawn from the JSON pool
// (ratio-weighted per combined category, see ratio-sampling.ts) + 2
// AI-generated "guess the image" questions appended by the caller
// (db.server.ts) — the AI pair is what used to be the static image quota;
// see mystery-pool.server.ts for why it replaced it.
export const DAILY_SET_SIZE = 10;
export const WEEKLY_SET_SIZE = 10;
export const AI_QUESTION_COUNT = 2;

/**
 * Builds a `size`-question set with slots spread across top-level categories
 * round-robin, so the set still touches most categories instead of
 * clustering on whichever category happens to shuffle first — each
 * category's own contribution is ratio-weighted by its combined-category
 * component ratios (see ratio-sampling.ts) when it has one.
 * `shuffleFn` is Math.random-shuffle for daily (different every play) or a
 * week-seeded shuffle for weekly (same set for everyone, all week).
 * `excludeIds` filters out questions the caller wants avoided (e.g. already
 * seen by this user, or already used in a past weekly set) — but only when
 * doing so still leaves enough candidates; a caller with a huge exclude set
 * doesn't get a broken/short set, it just recycles instead.
 */
function buildQuestionSet(
  size: number,
  shuffleFn: <T>(items: T[]) => T[],
  excludeIds: Set<number> = new Set(),
): Question[] {
  const filtered = excludeIds.size > 0 ? ALL_QUESTIONS.filter((q) => !excludeIds.has(q.id)) : ALL_QUESTIONS;
  const candidates = filtered.length >= size ? filtered : ALL_QUESTIONS;

  const usedIds = new Set<number>();
  const picks: Question[] = [];
  const tags = shuffleFn(TAXONOMY.topLevel);
  // Each top-level tag's own pool is ordered by its combined-category
  // component ratios (see ratio-sampling.ts) when it has one — the
  // round-robin consumption below is unchanged, only the order each tag's
  // queue is drawn from changes.
  const tagPools = new Map(
    tags.map((tag) => {
      const tagCandidates = candidates.filter((q) => q.subcategories.includes(tag));
      const components = COMBINED_CATEGORY_RATIOS[tag] ?? null;
      const queue = components ? pickWeighted(tagCandidates, components, size, new Set(), shuffleFn) : shuffleFn(tagCandidates);
      return [tag, queue];
    }),
  );

  let round = 0;
  while (picks.length < size) {
    let addedThisRound = false;
    for (const tag of tags) {
      if (picks.length >= size) break;
      const pool = tagPools.get(tag)!;
      const candidate = pool[round];
      if (candidate && !usedIds.has(candidate.id)) {
        picks.push(candidate);
        usedIds.add(candidate.id);
        addedThisRound = true;
      }
    }
    if (!addedThisRound) break; // pool exhausted across every category
    round++;
  }

  return shuffleFn(picks);
}

/** Different random set every time it's requested (matches the daily
 * challenge's "one per day" gate, not per-question determinism).
 * `excludeIds` — questions this user has already seen (any solo mode), plus
 * this week's weekly set (see #3 — daily never repeats what weekly used). */
export function buildDailySet(excludeIds: Set<number> = new Set()): Question[] {
  return buildQuestionSet(DAILY_SET_SIZE, shuffle, excludeIds);
}

/** Same set for every player for a given ISO week, seeded by the week string
 * so it changes automatically week to week. `excludeIds` — questions already
 * used in a past week's shared set (global, not per-user — keeps the set
 * identical for everyone within the week while never repeating across
 * weeks). */
export function buildWeeklySet(week: string = isoWeek(), excludeIds: Set<number> = new Set()): Question[] {
  return buildQuestionSet(WEEKLY_SET_SIZE, (items) => seededShuffle(items, `weekly:${week}`), excludeIds);
}

export function topLevelTagsForQuestions(questionIds: number[]): string[] {
  const tags = new Set<string>();
  for (const id of questionIds) {
    const q = ALL_QUESTIONS.find((q) => q.id === id);
    if (!q) continue;
    for (const tag of q.subcategories) {
      if (TAXONOMY.topLevel.includes(tag)) tags.add(tag);
    }
  }
  return [...tags];
}
