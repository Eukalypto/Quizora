// Isomorphic core of the question-bank merge pipeline — pure data in, data
// out, no filesystem access. Shared by scripts/merge-drive-questions.mjs
// (local dev, reads/writes local files) and the Worker's daily Cron sync
// (reads/writes R2 objects). Subject identity, hierarchy, and question tags
// all come from the Drive index (parseSubjectIndex below), matched against
// each file's own internal group/subgroup fields — not from a filename-keyed
// lookup — so adding a new Subject is purely a spreadsheet edit.

import type { Category, Question } from "@/lib/categories";

export type SubjectTier = "top-level" | "combo" | "modifier";

export interface Taxonomy {
  /** Fixed set of 11 legacy tags — badges.ts/categoryPlays crediting stays
   * scoped to these regardless of how many real Subjects exist now. Never
   * grows; see LEGACY_TAG_BY_SUBJECT_NAME for how questions still get
   * tagged with these from the index-driven data below. */
  topLevel: string[];
  /** Tag for every *combined* Subject (hierarchy-1 Domains and the
   * hierarchy-2 continent/catch-all Categories) — what session.ts's
   * round-robin draws across, so Daily/Weekly touch all real content
   * instead of only the 11 legacy tags. */
  domains: string[];
}

export interface RatioComponent {
  tags: [string];
  ratio: number;
}

export interface MergeInputFile {
  /** Filename without the .json extension, e.g. "Africa History". Used only
   * for error/report messages — Subject matching reads each file's own
   * internal group/subgroup fields, never the filename. */
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
  /** Files whose internal group/subgroup didn't match any index row — their
   * questions are dropped, never blocking the rest of the merge. */
  unmatchedFiles: string[];
  /** Index rows with no matching file — simply not shown to players; this
   * is an expected human/logistics gap, not an error. */
  indexOnlySubjects: string[];
  ratioTotalMismatches: string[];
}

export function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

function normalizeKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function pairKeyOf(groups: string, subgroups: string): string {
  return `${normalizeKey(groups)} ${normalizeKey(subgroups)}`;
}

// A question that's a component of one of these 11 legacy Subjects also
// gets the matching pre-rework tag added to `subcategories`, in addition to
// its real cat-* tags, purely so badges.ts's `categoryPlays["sciences"]`
// and `TAXONOMY.topLevel.every(...)` keep working unmodified — see the
// plan's "badges stay scoped to the old 11 tags" decision. Matched against
// the index's own Subject name (column B), taken verbatim.
const LEGACY_TAG_BY_SUBJECT_NAME: Record<string, string> = {
  History: "history",
  Geography: "geography",
  Traditions: "traditions",
  Arts: "arts",
  Literature: "literature",
  "Sciences 1": "sciences",
  "Sports 1": "sports",
  Music: "music",
  "Screen Arts": "screens",
  "Sciences 2": "sciences-2",
  "Sports 2": "sports-2",
};
export const LEGACY_TOP_LEVEL_TAGS = Object.values(LEGACY_TAG_BY_SUBJECT_NAME);

function hierarchyToKind(hierarchy: number): SubjectTier {
  if (hierarchy === 1) return "top-level";
  if (hierarchy === 2) return "combo";
  return "modifier";
}

interface IndexComponent {
  groups: string;
  subgroups: string;
  subgroupId: string;
  ratio: number | null;
}

interface IndexEntry {
  id: string;
  name: string;
  hierarchy: number;
  components: IndexComponent[];
}

interface ParsedSubjectIndex {
  entries: IndexEntry[];
  /** normalized "groups subgroups" -> 3-digit code, from column F. */
  subjectCodes: Map<string, string>;
  ratioTotalMismatches: string[];
}

function isCombinedEntry(entry: IndexEntry): boolean {
  return entry.components.length > 1 || (entry.components.length === 1 && entry.components[0].ratio !== null);
}

/**
 * Parses the Drive index's 7-column format:
 * id;Subject;Hierarchy;Groups;Subgroups;ID of the Subgroup;Ratio
 *
 * A combined Subject spans multiple rows: the first row carries its id,
 * Subject name and Hierarchy plus its first component; continuation rows
 * leave those three blank and add one more component each. Groups is
 * sometimes also left blank on a continuation row when it's constant across
 * the whole block (e.g. "Sciences 2") — carried forward from the block's
 * most recent non-blank Groups value in that case.
 *
 * A Subject is "combined" when it's detected structurally — multiple
 * components, or a single component that still carries a ratio — NOT gated
 * on hierarchy === 1, since the 6 continent catch-alls carry real ratios at
 * hierarchy 2.
 */
export function parseSubjectIndex(csvText: string): ParsedSubjectIndex {
  const withoutBom = csvText.replace(/^﻿/, "");
  const lines = withoutBom.split("\n").map((l) => l.trimEnd()).filter((l) => l.length > 0);
  const dataLines = lines.slice(1); // drop the header row

  const entries: IndexEntry[] = [];
  const subjectCodes = new Map<string, string>();
  let current: IndexEntry | null = null;
  let currentGroups = "";

  for (const line of dataLines) {
    const [id, name, hierarchy, groupsRaw, subgroupsRaw, subgroupIdRaw, ratioRaw] = line.split(";");
    const groups = (groupsRaw ?? "").trim();
    const subgroups = (subgroupsRaw ?? "").trim();

    if ((name ?? "").trim() !== "") {
      current = { id: (id ?? "").trim(), name: name.trim(), hierarchy: Number((hierarchy ?? "").trim()), components: [] };
      entries.push(current);
      currentGroups = groups;
    }
    if (!current) continue;
    if (subgroups === "") continue; // blank trailer row past the real data

    const effectiveGroups = groups !== "" ? groups : currentGroups;
    currentGroups = effectiveGroups;
    const ratioTrimmed = (ratioRaw ?? "").trim();
    const ratio = ratioTrimmed === "" ? null : Number(ratioTrimmed.replace(",", "."));
    const code = (subgroupIdRaw ?? "").trim();

    current.components.push({ groups: effectiveGroups, subgroups, subgroupId: code, ratio });
    if (code !== "") {
      subjectCodes.set(pairKeyOf(effectiveGroups, subgroups), code);
    }
  }

  const ratioTotalMismatches: string[] = [];
  for (const entry of entries) {
    if (!isCombinedEntry(entry)) continue;
    const total = entry.components.reduce((sum, c) => sum + (c.ratio ?? 0), 0);
    if (Math.abs(total - 10) > 1e-9) {
      ratioTotalMismatches.push(`${entry.name}: ratios sum to ${total}, expected 10`);
    }
  }

  return { entries, subjectCodes, ratioTotalMismatches };
}

export function buildQuestionId(subjectCode: string, fileRank: number, sourceId: number): number {
  return Number(subjectCode.padStart(3, "0") + String(fileRank).padStart(2, "0") + String(sourceId).padStart(4, "0"));
}

interface RawQuestion {
  id?: unknown;
  group?: unknown;
  subgroup?: unknown;
  level?: unknown;
  question?: unknown;
  answers?: unknown;
  correct?: unknown;
  media_url?: unknown;
}

function validateQuestion(q: RawQuestion): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(q.id) || (q.id as number) < 1 || (q.id as number) > 9999) {
    errors.push(`id: must be an integer 1-9999 (got ${JSON.stringify(q.id)})`);
  }
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

function catTag(entryId: string): string {
  return `cat-${entryId}`;
}

function sortSubjects(categories: Category[]): Category[] {
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  return [...categories].sort((a, b) => {
    if (a.kind !== b.kind) return 0; // never compares across tiers — grouped by caller
    const aBizarre = a.label === "Bizarre";
    const bBizarre = b.label === "Bizarre";
    if (a.kind === "top-level" && (aBizarre || bBizarre)) {
      if (aBizarre && !bBizarre) return 1;
      if (bBizarre && !aBizarre) return -1;
    }
    return collator.compare(a.label, b.label);
  });
}

function buildCategories(entries: IndexEntry[], presentPairs: Set<string>): Category[] {
  const byTier: Record<SubjectTier, Category[]> = { "top-level": [], combo: [], modifier: [] };
  for (const entry of entries) {
    const hasContent = entry.components.some((c) => presentPairs.has(pairKeyOf(c.groups, c.subgroups)));
    if (!hasContent) continue; // index row with no backing file — don't display (rule #3)
    const tag = catTag(entry.id);
    const kind = hierarchyToKind(entry.hierarchy);
    byTier[kind].push({ key: tag, label: entry.name, tags: [tag], matchMode: "all", kind });
  }
  return [...sortSubjects(byTier["top-level"]), ...sortSubjects(byTier.combo), ...sortSubjects(byTier.modifier)];
}

function buildCombinedCategoryRatios(entries: IndexEntry[]): Record<string, RatioComponent[]> {
  const combined: Record<string, RatioComponent[]> = {};
  for (const entry of entries) {
    if (!isCombinedEntry(entry)) continue;
    const tag = catTag(entry.id);
    combined[tag] = entry.components.map((c) => ({
      tags: [catTag(leafEntryIdFor(entries, c.groups, c.subgroups) ?? entry.id)] as [string],
      ratio: c.ratio ?? 0,
    }));
  }
  return combined;
}

// The single-component entry that "owns" a given Group/Subgroup pair (e.g.
// "History of Europe" for Europe/History) — every real pair has exactly one.
// Falls back to the combined entry's own id if none is found (defensive;
// doesn't happen with real data, but avoids an undefined tag).
function leafEntryIdFor(entries: IndexEntry[], groups: string, subgroups: string): string | null {
  const key = pairKeyOf(groups, subgroups);
  const leaf = entries.find((e) => e.components.length === 1 && pairKeyOf(e.components[0].groups, e.components[0].subgroups) === key);
  return leaf?.id ?? null;
}

/**
 * Merge raw-source files + the image-questions supplement + the Subject
 * index into the compiled bank. Pure function: no fs, no network — callers
 * own fetching the inputs (local disk or R2) and persisting the outputs.
 */
export function mergeQuestionBank(input: {
  files: MergeInputFile[];
  imageQuestionsRaw: string;
  ratioCsv: string | null;
}): MergeResult {
  if (!input.ratioCsv) {
    throw new Error("Subject index is required — mergeQuestionBank can no longer run without it.");
  }

  const failures: string[] = [];
  const perFileCounts: Record<string, number> = {};
  const unmatchedFiles: string[] = [];

  const index = parseSubjectIndex(input.ratioCsv);

  const indexPairKeys = new Set<string>();
  for (const entry of index.entries) {
    for (const c of entry.components) indexPairKeys.add(pairKeyOf(c.groups, c.subgroups));
  }
  // Every entry (of any hierarchy) that lists a given pair as a component —
  // a real pair typically appears in its own leaf entry plus 1-2 combined
  // ones (e.g. Europe/History → "History of Europe", "History", "Europe").
  const entriesByPair = new Map<string, IndexEntry[]>();
  for (const entry of index.entries) {
    for (const c of entry.components) {
      const key = pairKeyOf(c.groups, c.subgroups);
      const list = entriesByPair.get(key) ?? [];
      list.push(entry);
      entriesByPair.set(key, list);
    }
  }

  interface ParsedFile {
    file: MergeInputFile;
    pairKey: string;
    groups: string;
    subgroups: string;
    rows: RawQuestion[];
  }
  const parsedFiles: ParsedFile[] = [];

  for (const file of input.files) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch (err) {
      failures.push(`${file.name}.json: JSON parse error — ${(err as Error).message}`);
      continue;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      failures.push(`${file.name}.json: expected a non-empty top-level array`);
      continue;
    }
    const first = parsed[0] as RawQuestion;
    const groups = typeof first.group === "string" ? first.group.trim() : "";
    const subgroups = typeof first.subgroup === "string" ? first.subgroup.trim() : "";
    const pairKey = pairKeyOf(groups, subgroups);

    if (!indexPairKeys.has(pairKey)) {
      unmatchedFiles.push(`${file.name}.json (group="${groups}", subgroup="${subgroups}")`);
      continue;
    }
    parsedFiles.push({ file, pairKey, groups, subgroups, rows: parsed as RawQuestion[] });
  }

  // Alphabetical rank among files sharing the same Group/Subgroup pair —
  // always resolves to 1 today (no duplicate pairs across real files), but
  // means a future second file for the same pair works with no migration.
  const rankByFileName = new Map<string, number>();
  const byPair = new Map<string, ParsedFile[]>();
  for (const pf of parsedFiles) {
    const list = byPair.get(pf.pairKey) ?? [];
    list.push(pf);
    byPair.set(pf.pairKey, list);
  }
  for (const list of byPair.values()) {
    const sorted = [...list].sort((a, b) => a.file.name.localeCompare(b.file.name));
    sorted.forEach((pf, i) => rankByFileName.set(pf.file.name, i + 1));
  }

  const merged: Question[] = [];
  const presentPairs = new Set<string>();

  for (const pf of parsedFiles) {
    const subjectCode = index.subjectCodes.get(pf.pairKey);
    if (!subjectCode) {
      unmatchedFiles.push(`${pf.file.name}.json (group="${pf.groups}", subgroup="${pf.subgroups}" — index row has no "ID of the Subgroup")`);
      continue;
    }
    const fileRank = rankByFileName.get(pf.file.name)!;
    presentPairs.add(pf.pairKey);

    const owningEntries = entriesByPair.get(pf.pairKey) ?? [];
    const catTags = owningEntries.map((e) => catTag(e.id));
    const legacyTags = owningEntries.map((e) => LEGACY_TAG_BY_SUBJECT_NAME[e.name]).filter((t): t is string => !!t);
    const subcategories = [...new Set([...catTags, ...legacyTags])];

    let fileCount = 0;
    for (const [i, q] of pf.rows.entries()) {
      const errors = validateQuestion(q);
      if (errors.length > 0) {
        failures.push(`${pf.file.name}.json row ${i + 1} (id=${(q as { id?: unknown })?.id ?? "?"}): ${errors.join("; ")}`);
        continue;
      }
      merged.push({
        id: buildQuestionId(subjectCode, fileRank, q.id as number),
        subcategories,
        level: q.level as 1 | 2 | 3,
        question: (q.question as string).trim(),
        answers: (q.answers as string[]).map((a) => a.trim()) as [string, string, string, string],
        correct: q.correct as 0 | 1 | 2 | 3,
        media_url: q.media_url && (q.media_url as string).trim() !== "" ? (q.media_url as string).trim() : null,
      });
      fileCount++;
    }
    perFileCounts[`${pf.file.name}.json`] = fileCount;
  }

  // Static hand-curated supplement — kept on the old flat topic/continent
  // tagging (not retagged to cat-* Subjects here; out of scope for this
  // pass), so these questions stay in the general pool but won't surface
  // under any specific Subject filter until retagged. Ids count down from
  // -1, a small fixed-size range distinct from AI questions' negative ids
  // (which are offset well past -1,000,000 — see db.server.ts).
  const imageQuestionsRaw = JSON.parse(input.imageQuestionsRaw) as (RawQuestion & { subcategories: string[] })[];
  let imageQuestionCount = 0;
  let nextImageId = -1;
  for (const [i, q] of imageQuestionsRaw.entries()) {
    const errors = validateQuestion({ ...q, id: 1 });
    if (errors.length > 0) {
      failures.push(`image-questions.json row ${i + 1}: ${errors.join("; ")}`);
      continue;
    }
    merged.push({
      id: nextImageId--,
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

  const indexOnlySubjects = index.entries
    .filter((e) => !e.components.some((c) => presentPairs.has(pairKeyOf(c.groups, c.subgroups))))
    .map((e) => e.name);

  const taxonomy: Taxonomy = {
    topLevel: LEGACY_TOP_LEVEL_TAGS,
    domains: index.entries.filter(isCombinedEntry).map((e) => catTag(e.id)),
  };
  const categories = buildCategories(index.entries, presentPairs);
  const combinedCategories = buildCombinedCategoryRatios(index.entries);

  return {
    questions: merged,
    taxonomy,
    categories,
    combinedCategories,
    perFileCounts,
    failures,
    unmatchedFiles,
    indexOnlySubjects,
    ratioTotalMismatches: index.ratioTotalMismatches,
  };
}
