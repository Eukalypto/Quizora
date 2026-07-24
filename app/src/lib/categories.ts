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

// The Drive index defines Sciences and Sports as two DISTINCT combined
// categories each (a regional combo and a by-discipline combo — see the
// index's "Sciences 1"/"Sciences 2"/"Sports 1"/"Sports 2" naming), but they'd
// otherwise both collapse onto the same "sciences"/"sports" tag-derived
// label. The regional combo keeps its original tag (no data retagging
// needed) but is labeled "…1"; the by-discipline combo gets its own tag
// (sciences-2/sports-2, wired in merge-drive-questions.mjs) labeled "…2".
const TOP_LEVEL_LABEL_OVERRIDES: Record<string, string> = {
  sciences: "Sciences 1",
  sports: "Sports 1",
  "sciences-2": "Sciences 2",
  "sports-2": "Sports 2",
};

function humanizeTag(tag: string): string {
  return tag
    .split("-")
    .map((word) => (/^\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export function questionMatchesCategory(question: Question, category: Pick<Category, "tags">): boolean {
  return category.tags.every((tag) => question.subcategories.includes(tag));
}

/**
 * Derive the full selectable category list from a question bank + taxonomy.
 * Pure function — memoize the *result*, not this call, when the source data
 * is static (see `ALL_CATEGORIES` below).
 */
export function deriveCategories(
  questions: Question[],
  taxonomy: { topLevel: string[]; continents: string[]; centuries: string[] },
): Category[] {
  const categories: Category[] = [];
  const topLevelSet = new Set(taxonomy.topLevel);
  const continentSet = new Set(taxonomy.continents);

  const countMatches = (tags: string[]) =>
    questions.reduce((n, q) => (questionMatchesCategory(q, { tags }) ? n + 1 : n), 0);

  // 1. Pure top-level categories — one per top-level tag with >=1 question.
  for (const tag of taxonomy.topLevel) {
    if (countMatches([tag]) === 0) continue;
    categories.push({
      key: tag,
      label: TOP_LEVEL_LABEL_OVERRIDES[tag] ?? humanizeTag(tag),
      tags: [tag],
      matchMode: "all",
      kind: "top-level",
    });
  }

  // 2. Combos — every (top-level x continent) pair that actually co-occurs.
  for (const top of taxonomy.topLevel) {
    for (const continent of taxonomy.continents) {
      const tags = [top, continent];
      if (countMatches(tags) === 0) continue;
      categories.push({
        key: `${top}__${continent}`,
        label: `${humanizeTag(top)} of ${humanizeTag(continent)}`,
        tags,
        matchMode: "all",
        kind: "combo",
      });
    }
  }

  // 3. Standalone modifiers — any tag actually present in the data that is
  // neither top-level nor a continent (e.g. century tags) becomes its own
  // category, matching regardless of other tags on the question.
  const modifierTags = new Set<string>();
  for (const q of questions) {
    for (const tag of q.subcategories) {
      if (!topLevelSet.has(tag) && !continentSet.has(tag)) {
        modifierTags.add(tag);
      }
    }
  }
  for (const tag of modifierTags) {
    categories.push({
      key: tag,
      label: humanizeTag(tag),
      tags: [tag],
      matchMode: "all",
      kind: "modifier",
    });
  }

  return categories;
}

export function getQuestionsForCategory(questions: Question[], category: Pick<Category, "tags">): Question[] {
  return questions.filter((q) => questionMatchesCategory(q, category));
}
