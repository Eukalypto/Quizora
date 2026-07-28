// Isomorphic core of the question-bank merge pipeline — pure data in, data
// out, no filesystem access. Shared by scripts/merge-drive-questions.mjs
// (local dev, reads/writes local files) and the Worker's daily Cron sync
// (reads/writes R2 objects). Keep in sync with the Drive index's naming
// conventions — see the comment block in merge-drive-questions.mjs for the
// full "why filename, not internal fields" rationale.

import { deriveCategories, type Category, type Question } from "@/lib/categories";

export interface Taxonomy {
  topLevel: string[];
  continents: string[];
  centuries: string[];
}

export interface RatioComponent {
  tags: [string, string];
  ratio: number;
}

export interface MergeInputFile {
  /** Filename without the .json extension, e.g. "Africa History". */
  name: string;
  content: string;
}

export interface MergeResult {
  questions: Question[];
  taxonomy: Taxonomy;
  categories: Category[];
  combinedCategories: Record<string, RatioComponent[]>;
  perFileCounts: Record<string, number>;
  failures: string[];
  skippedRatioBlocks: string[];
  ratioTotalMismatches: string[];
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

// Drive-side combined-category blocks where the Group column (not Subgroup)
// is the constant axis — see parseCombinedCategoryRatios below.
const GROUP_CONSTANT_COMBOS: Record<string, string> = {
  "Sciences 2": "sciences-2",
  "Sports 2": "sports-2",
};

function parseCombinedCategoryRatios(
  csvText: string,
  topLevelTags: string[],
  continentTags: string[],
): { combined: Record<string, RatioComponent[]>; skipped: string[]; totalMismatches: string[] } {
  const lines = csvText.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const rows = lines.slice(1).map((line) => {
    const [, category, hierarchy, groups, subgroups, ratio] = line.split(";");
    return {
      category: (category ?? "").trim(),
      hierarchy: (hierarchy ?? "").trim(),
      groups: (groups ?? "").trim(),
      subgroups: (subgroups ?? "").trim(),
      ratio: (ratio ?? "").trim(),
    };
  });

  const blocks: { name: string; hierarchy: string; components: { groups: string; subgroups: string; ratio: string }[] }[] = [];
  let current: (typeof blocks)[number] | null = null;
  for (const row of rows) {
    if (row.category !== "") {
      current = { name: row.category, hierarchy: row.hierarchy, components: [] };
      blocks.push(current);
    }
    if (!current) continue;
    if (row.ratio === "") continue;
    current.components.push({ groups: row.groups, subgroups: row.subgroups, ratio: row.ratio });
  }

  const combined: Record<string, RatioComponent[]> = {};
  const skipped: string[] = [];
  const totalMismatches: string[] = [];

  for (const block of blocks.filter((b) => b.hierarchy === "1" && b.components.length > 0)) {
    const subgroupsSet = new Set(block.components.map((c) => c.subgroups));
    const isTopicConstant = subgroupsSet.size === 1;
    const explicitTopTag = GROUP_CONSTANT_COMBOS[block.name];

    let topTag: string;
    let components: RatioComponent[];
    if (isTopicConstant) {
      topTag = slugify([...subgroupsSet][0]);
      if (!topLevelTags.includes(topTag)) {
        skipped.push(`${block.name} (unknown top-level tag "${topTag}")`);
        continue;
      }
      components = block.components.map((c) => ({
        tags: [topTag, slugify(c.groups)] as [string, string],
        ratio: Number(c.ratio.replace(",", ".")),
      }));
      const unknownContinent = components.find((c) => !continentTags.includes(c.tags[1]));
      if (unknownContinent) {
        skipped.push(`${block.name} (unknown continent tag "${unknownContinent.tags[1]}")`);
        continue;
      }
    } else if (explicitTopTag) {
      topTag = explicitTopTag;
      components = block.components.map((c) => ({
        tags: [topTag, slugify(c.subgroups)] as [string, string],
        ratio: Number(c.ratio.replace(",", ".")),
      }));
    } else {
      skipped.push(block.name);
      continue;
    }

    const total = components.reduce((sum, c) => sum + c.ratio, 0);
    if (Math.abs(total - 10) > 1e-9) {
      totalMismatches.push(`${block.name}: ratios sum to ${total}, expected 10`);
    }
    combined[topTag] = components;
  }

  return { combined, skipped, totalMismatches };
}

// filename (without .json) -> tags. See merge-drive-questions.mjs's original
// comment for the full rationale — filenames are the only consistent tagging
// signal across the Drive-sourced files.
export const TAG_MAP: Record<string, [string, string]> = {
  "Africa Geography": ["geography", "africa"],
  "Africa History": ["history", "africa"],
  "Africa Literature": ["literature", "africa"],
  "Africa Science": ["sciences", "africa"],
  "Africa Traditions": ["traditions", "africa"],
  "Asia Art": ["arts", "asia"],
  "Asia Geography": ["geography", "asia"],
  "Asia History": ["history", "asia"],
  "Asia Literature": ["literature", "asia"],
  "Asia Science": ["sciences", "asia"],
  "Asia Sports": ["sports", "asia"],
  "Asia Traditions": ["traditions", "asia"],
  "Europe Art": ["arts", "europe"],
  "Europe Geography": ["geography", "europe"],
  "Europe History": ["history", "europe"],
  "Europe Literature": ["literature", "europe"],
  "Europe Science": ["sciences", "europe"],
  "Europe Sports": ["sports", "europe"],
  "Europe Traditions": ["traditions", "europe"],
  "Music Classical": ["music", "classical-music"],
  "Music Rock": ["music", "rock"],
  "NorthAmerica Arts": ["arts", "north-america"],
  "NorthAmerica Geography": ["geography", "north-america"],
  "NorthAmerica History": ["history", "north-america"],
  "NorthAmerica Literature": ["literature", "north-america"],
  "NorthAmerica Science": ["sciences", "north-america"],
  "NorthAmerica Sports": ["sports", "north-america"],
  "NorthAmerica Traditions": ["traditions", "north-america"],
  "Oceania Geography": ["geography", "oceania"],
  "Oceania History": ["history", "oceania"],
  "Oceania Literature": ["literature", "oceania"],
  "Oceania Science": ["sciences", "oceania"],
  "Oceania Traditions": ["traditions", "oceania"],
  "Screens Cinema": ["screens", "cinema"],
  "Screens Series": ["screens", "series"],
  "Screens TV": ["screens", "television"],
  "SouthAmerica Art": ["arts", "south-america"],
  "SouthAmerica Geography": ["geography", "south-america"],
  "SouthAmerica History": ["history", "south-america"],
  "SouthAmerica Literature": ["literature", "south-america"],
  "SouthAmerica Science": ["sciences", "south-america"],
  "SouthAmerica Sports": ["sports", "south-america"],
  "SouthAmerica Traditions": ["traditions", "south-america"],
  "Sciences Physics": ["sciences-2", "physics"],
  "Sciences Chemistry": ["sciences-2", "chemistry"],
  "Sciences Space": ["sciences-2", "space"],
  "Sciences Geology": ["sciences-2", "geology"],
  "Sciences Biology": ["sciences-2", "biology"],
  "Sciences Human Body": ["sciences-2", "human-body"],
  "Sciences Earth and Climate": ["sciences-2", "earth-and-climate"],
  "Sciences Technology": ["sciences-2", "technology"],
  "Sports Football": ["sports-2", "football"],
  "Sports Basketball": ["sports-2", "basketball"],
  "Sports Tennis": ["sports-2", "tennis"],
  "Sports Racing": ["sports-2", "racing"],
  "Sports Athletics": ["sports-2", "athletics"],
  "Sports Gymnastics": ["sports-2", "gymnastics"],
  "Sports Olympic Games": ["sports-2", "olympic-games"],
  "Sports Golf": ["sports-2", "golf"],
  "Sports Combat Sports": ["sports-2", "combat-sports"],
};

export const TOP_LEVEL_TAGS = [
  "history", "geography", "traditions", "arts", "literature",
  "sciences", "sports", "music", "screens", "sciences-2", "sports-2",
];
export const CONTINENT_TAGS = ["europe", "asia", "north-america", "south-america", "africa", "oceania"];

function stripInternalTagFields(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/["“”](sub)?(category|group)["“”]\s*:/i.test(line))
    .join("\n");
}

interface RawQuestion {
  id?: unknown;
  level?: unknown;
  question?: unknown;
  answers?: unknown;
  correct?: unknown;
  media_url?: unknown;
  subcategories?: unknown;
}

function validateQuestion(q: RawQuestion): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(q.id)) errors.push("id: must be an integer");
  if (![1, 2, 3].includes(q.level as number)) errors.push(`level: must be 1, 2, or 3 (got ${JSON.stringify(q.level)})`);
  if (!q.question || typeof q.question !== "string" || q.question.trim() === "") errors.push("question: must be a non-empty string");
  if (!Array.isArray(q.answers) || q.answers.length !== 4) {
    errors.push(`answers: must contain exactly 4 entries (got ${Array.isArray(q.answers) ? q.answers.length : typeof q.answers})`);
  } else if (q.answers.some((a) => !a || typeof a !== "string" || a.trim() === "")) {
    errors.push("answers: every answer must be a non-empty string");
  }
  if (![0, 1, 2, 3].includes(q.correct as number)) errors.push(`correct: must be an integer 0-3 (got ${JSON.stringify(q.correct)})`);
  if (q.media_url !== null && q.media_url !== undefined && q.media_url !== "") {
    if (typeof q.media_url !== "string" || !/^https:\/\//.test(q.media_url)) {
      errors.push(`media_url: must be empty or an https URL (got ${JSON.stringify(q.media_url)})`);
    }
  }
  return errors;
}

/**
 * Merge raw-source files + the image-questions supplement + the ratio index
 * into the compiled bank. Pure function: no fs, no network — callers own
 * fetching the inputs (local disk or R2) and persisting the outputs.
 */
export function mergeQuestionBank(input: {
  files: MergeInputFile[];
  imageQuestionsRaw: string;
  ratioCsv: string | null;
}): MergeResult {
  const failures: string[] = [];
  const perFileCounts: Record<string, number> = {};

  const missingMapping = input.files.filter((f) => !(f.name in TAG_MAP));
  if (missingMapping.length > 0) {
    throw new Error(`No TAG_MAP entry for: ${missingMapping.map((f) => f.name).join(", ")}`);
  }

  let nextId = 1;
  const merged: Question[] = [];

  for (const file of input.files) {
    const tags = TAG_MAP[file.name];
    const cleaned = stripInternalTagFields(file.content);

    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      failures.push(`${file.name}.json: JSON parse error — ${(err as Error).message}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      failures.push(`${file.name}.json: expected a top-level array`);
      continue;
    }

    let fileCount = 0;
    for (const [i, q] of (parsed as RawQuestion[]).entries()) {
      const errors = validateQuestion(q);
      if (errors.length > 0) {
        failures.push(`${file.name}.json row ${i + 1} (id=${(q as { id?: unknown })?.id ?? "?"}): ${errors.join("; ")}`);
        continue;
      }
      merged.push({
        id: nextId++,
        subcategories: tags,
        level: q.level as 1 | 2 | 3,
        question: (q.question as string).trim(),
        answers: (q.answers as string[]).map((a) => a.trim()) as [string, string, string, string],
        correct: q.correct as 0 | 1 | 2 | 3,
        media_url: q.media_url && (q.media_url as string).trim() !== "" ? (q.media_url as string).trim() : null,
      });
      fileCount++;
    }
    perFileCounts[`${file.name}.json`] = fileCount;
  }

  const imageQuestionsRaw = JSON.parse(input.imageQuestionsRaw) as (RawQuestion & { subcategories: string[] })[];
  let imageQuestionCount = 0;
  for (const [i, q] of imageQuestionsRaw.entries()) {
    const errors = validateQuestion({ ...q, id: 0 });
    if (errors.length > 0) {
      failures.push(`image-questions.json row ${i + 1}: ${errors.join("; ")}`);
      continue;
    }
    merged.push({
      id: nextId++,
      subcategories: q.subcategories,
      level: q.level as 1 | 2 | 3,
      question: (q.question as string).trim(),
      answers: (q.answers as string[]).map((a) => a.trim()) as [string, string, string, string],
      correct: q.correct as 0 | 1 | 2 | 3,
      media_url: q.media_url && (q.media_url as string).trim() !== "" ? (q.media_url as string).trim() : null,
    });
    imageQuestionCount++;
  }
  perFileCounts["image-questions.json"] = imageQuestionCount;

  if (merged.length === 0) {
    throw new Error("No valid questions produced — aborting without writing output.");
  }

  const taxonomy: Taxonomy = { topLevel: TOP_LEVEL_TAGS, continents: CONTINENT_TAGS, centuries: [] };
  const categories = deriveCategories(merged, taxonomy);

  let combinedCategories: Record<string, RatioComponent[]> = {};
  let skippedRatioBlocks: string[] = [];
  let ratioTotalMismatches: string[] = [];
  if (input.ratioCsv) {
    const parsed = parseCombinedCategoryRatios(input.ratioCsv, TOP_LEVEL_TAGS, CONTINENT_TAGS);
    combinedCategories = parsed.combined;
    skippedRatioBlocks = parsed.skipped;
    ratioTotalMismatches = parsed.totalMismatches;
  }

  return {
    questions: merged,
    taxonomy,
    categories,
    combinedCategories,
    perFileCounts,
    failures,
    skippedRatioBlocks,
    ratioTotalMismatches,
  };
}
