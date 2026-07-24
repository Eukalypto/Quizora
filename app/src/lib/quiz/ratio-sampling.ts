import combinedCategoriesJson from "@/data/combined-categories.json";
import type { Question } from "@/lib/categories";

export interface RatioComponent {
  tags: string[];
  ratio: number;
}

/** Combined-category component ratios, keyed by top-level tag — see the
 * Drive index's ratio column. Only categories built from "one topic across
 * every continent" (History, Geography, Traditions, Arts, Literature,
 * Sciences, Sports) are present; see merge-drive-questions.mjs for why the
 * others (topic-only combos, continent catch-alls) aren't mapped yet. */
export const COMBINED_CATEGORY_RATIOS = combinedCategoriesJson as Record<string, RatioComponent[]>;

function defaultShuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface Allocation extends RatioComponent {
  pool: Question[];
  base: number;
  remainder: number;
}

/**
 * Picks `count` questions from `pool`, honoring each component's declared
 * ratio when `components` is given (a combined category's ratio set from
 * the Drive index) — otherwise falls back to a flat shuffle.
 *
 * Each component gets `floor(ratio/total * count)` guaranteed picks; any
 * leftover slots (from fractional remainders — this is where the index's
 * "pairs of 0.5 compete randomly" rule lives) go to a weighted lottery
 * across components proportional to their remainder. When a component's
 * ratio total isn't exactly `count`-compatible (e.g. Visual Arts' 11 for a
 * 10-slot draw), any still-unassigned slots after the lottery fall back to
 * round-robin by ratio size so `count` is still met.
 *
 * `shuffleFn` lets callers pass a seeded shuffle (Weekly's fixed-per-week
 * set) instead of the default Math.random one (Daily/Solo/Live).
 */
export function pickWeighted(
  pool: Question[],
  components: RatioComponent[] | null,
  count: number,
  excludeIds: Set<number>,
  shuffleFn: <T>(items: T[]) => T[] = defaultShuffle,
): Question[] {
  const available = pool.filter((q) => !excludeIds.has(q.id));
  if (count <= 0) return [];
  if (!components || components.length === 0) {
    return shuffleFn(available).slice(0, count);
  }

  const total = components.reduce((sum, c) => sum + c.ratio, 0);
  const allocations: Allocation[] = components.map((c) => {
    const raw = total > 0 ? (c.ratio / total) * count : 0;
    const base = Math.floor(raw);
    return {
      ...c,
      pool: shuffleFn(available.filter((q) => c.tags.every((t) => q.subcategories.includes(t)))),
      base,
      remainder: raw - base,
    };
  });

  const picks = new Map<Allocation, number>(allocations.map((a) => [a, a.base]));
  let leftover = count - allocations.reduce((sum, a) => sum + a.base, 0);

  if (leftover > 0) {
    const TICKET_SCALE = 1000;
    const tickets: Allocation[] = [];
    for (const a of allocations) {
      const n = Math.round(a.remainder * TICKET_SCALE);
      for (let i = 0; i < n; i++) tickets.push(a);
    }
    const drawn = shuffleFn(tickets);
    const winners: Allocation[] = [];
    const won = new Set<Allocation>();
    for (const t of drawn) {
      if (winners.length >= leftover) break;
      if (won.has(t)) continue;
      won.add(t);
      winners.push(t);
    }
    for (const w of winners) picks.set(w, (picks.get(w) ?? 0) + 1);
    leftover -= winners.length;
  }

  if (leftover > 0) {
    // Ratio total isn't `count`-compatible — hand out the rest round-robin,
    // largest ratio first, so we still return `count` questions.
    const bySize = [...allocations].sort((a, b) => b.ratio - a.ratio);
    for (let i = 0; leftover > 0; i++, leftover--) {
      const a = bySize[i % bySize.length];
      picks.set(a, (picks.get(a) ?? 0) + 1);
    }
  }

  const result: Question[] = [];
  const usedIds = new Set<number>();
  let shortfall = 0;
  for (const a of allocations) {
    const want = picks.get(a) ?? 0;
    const got = a.pool.filter((q) => !usedIds.has(q.id)).slice(0, want);
    got.forEach((q) => usedIds.add(q.id));
    result.push(...got);
    shortfall += want - got.length;
  }

  // A component's own sub-pool ran dry (e.g. a missing/thin source file) —
  // backfill from the rest of the available pool so the caller still gets
  // `count` whenever the bank as a whole has enough, rather than silently
  // under-filling.
  if (shortfall > 0) {
    const backfill = shuffleFn(available.filter((q) => !usedIds.has(q.id))).slice(0, shortfall);
    result.push(...backfill);
  }

  return shuffleFn(result);
}
