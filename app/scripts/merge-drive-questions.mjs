#!/usr/bin/env bun
// One-shot ingestion of the real Drive-sourced question bank into
// src/data/questions.json + src/data/taxonomy.json, replacing the mock set.
//
// Source: app/scripts/raw-source/*.json — one file per (continent, topic) or
// (subject-group, subtopic) pair, fetched verbatim from the shared Drive
// folder. Filenames encode the pair authoritatively; see TAG_MAP below.
//
// Why filename > internal fields: the files disagree with each other about
// field naming ("category"/"subcategory" vs "group"/"subgroup") AND about
// which of those two fields holds the continent vs the topic — e.g. Africa
// files put topic first, Europe files put continent first. IDs are also not
// globally unique (multiple files start at id 1, or 1001, etc). The Drive
// folder's own Index.csv + the filename convention is the one thing that's
// consistent, so this script trusts ONLY the filename for tagging, ignores
// the internal category/subcategory/group/subgroup fields entirely, and
// renumbers every question with a fresh globally-unique id.
//
// Run: bun run scripts/merge-drive-questions.mjs

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { deriveCategories } from "../src/lib/categories.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "raw-source");
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const QUESTIONS_OUT = path.join(DATA_DIR, "questions.json");
const TAXONOMY_OUT = path.join(DATA_DIR, "taxonomy.json");
// Hand-curated image questions recovered from the original mock set (real
// Wikimedia/Higgsfield media_urls), retagged to the real taxonomy and
// re-shuffled (the mock data had `correct` at index 0 almost every time).
// Appended after the Drive-sourced questions so daily/weekly's image quota
// has real supply. Not sourced from Drive — kept as a static supplement.
const IMAGE_QUESTIONS_PATH = path.join(DATA_DIR, "image-questions.json");
// Precomputed at merge time so client code that only needs the category list
// (nav/free-play pickers) never has to import the full ~11k-question array
// into the browser bundle — see src/lib/category-list.ts.
const CATEGORIES_OUT = path.join(DATA_DIR, "categories.json");
// The Drive index's ratio column (component weighting for combined
// categories) — see parseCombinedCategoryRatios below.
const RATIO_INDEX_PATH = path.join(RAW_DIR, "_Index.csv");
const COMBINED_CATEGORIES_OUT = path.join(DATA_DIR, "combined-categories.json");

function slugify(label) {
  return label.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Parses the Drive index CSV's combined-category ratio blocks into
 * { [topLevelTag]: [{ tags: [topLevelTag, continentTag], ratio }] }.
 *
 * Handles two patterns:
 *  - "topic constant across continents" (History, Geography, Traditions,
 *    Arts, Literature, Sciences 1, Sports 1) — maps onto deriveCategories'
 *    existing top-level tags, whose components are the topic+continent
 *    combo categories.
 *  - the explicit "Sciences 2"/"Sports 2" by-discipline combos (Group
 *    constant, Subgroups vary) — these get their own dedicated top-level
 *    tags (sciences-2/sports-2, see TOP_LEVEL_TAGS + TAG_MAP) rather than
 *    colliding with Sciences 1/Sports 1's "sciences"/"sports" tags.
 * Every other Group-constant combined category (continent catch-alls,
 * Music, Visual Arts, Screen Arts, Entertainment) isn't wired to an
 * explicit tag yet — deliberately not generalized further, since guessing
 * a slug from the block's own name risks colliding with a tag that's
 * already in use for something else (e.g. "Screen Arts" vs the existing
 * "screens" tag) — so those are skipped and reported, not silently dropped.
 */
const GROUP_CONSTANT_COMBOS = {
  "Sciences 2": "sciences-2",
  "Sports 2": "sports-2",
};

function parseCombinedCategoryRatios(csvText, topLevelTags, continentTags) {
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

  // A non-empty Category cell (column B) marks the start of a new numbered
  // entry regardless of its own hierarchy value — hierarchy is just a
  // display-order flag, not the block boundary. Every prior attempt that
  // gated block-start on hierarchy === "1" let non-combined rows (e.g. the
  // continent catch-alls, hierarchy "2") bleed into whatever combined block
  // preceded them, since those rows still carry a ratio.
  const blocks = [];
  let current = null;
  for (const row of rows) {
    if (row.category !== "") {
      current = { name: row.category, hierarchy: row.hierarchy, components: [] };
      blocks.push(current);
    }
    if (!current) continue;
    if (row.ratio === "") continue;
    current.components.push({ groups: row.groups, subgroups: row.subgroups, ratio: row.ratio });
  }

  const combined = {};
  const skipped = [];
  const totalMismatches = [];

  // Only hierarchy "1" rows with at least one ratio'd component are actually
  // combined categories — hierarchy "1" rows with no ratio (e.g. "Bizarre",
  // a standalone entry that happens to share the same display-order flag)
  // aren't combined categories at all and shouldn't be reported as skipped.
  for (const block of blocks.filter((b) => b.hierarchy === "1" && b.components.length > 0)) {
    const subgroupsSet = new Set(block.components.map((c) => c.subgroups));
    const isTopicConstant = subgroupsSet.size === 1;
    const explicitTopTag = GROUP_CONSTANT_COMBOS[block.name];

    let topTag;
    let components;
    if (isTopicConstant) {
      topTag = slugify([...subgroupsSet][0]);
      if (!topLevelTags.includes(topTag)) {
        skipped.push(`${block.name} (unknown top-level tag "${topTag}")`);
        continue;
      }
      components = block.components.map((c) => ({
        tags: [topTag, slugify(c.groups)],
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
        tags: [topTag, slugify(c.subgroups)],
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

// filename (without .json) -> tags. Every file is exactly two Drive-side
// axes: a continent + topic (the 6x7 regional grid) or a subject group +
// subtopic (Music/Screens so far). Tags become `subcategories` verbatim.
const TAG_MAP = {
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
  // Sciences 2 / Sports 2 — the Drive index's by-discipline combos, distinct
  // from the regional Sciences 1/Sports 1 above (see TOP_LEVEL_LABEL_OVERRIDES
  // in categories.ts and GROUP_CONSTANT_COMBOS above). None of these files
  // exist yet — entries are pre-wired so they activate the moment a file
  // with this exact name is uploaded, no further script changes needed.
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

const TOP_LEVEL_TAGS = [
  "history",
  "geography",
  "traditions",
  "arts",
  "literature",
  "sciences",
  "sports",
  "music",
  "screens",
  "sciences-2",
  "sports-2",
];
const CONTINENT_TAGS = ["europe", "asia", "north-america", "south-america", "africa", "oceania"];

/** Strip the internal category/subcategory/group/subgroup key-value lines —
 * present in either straight or curly-quote form, sometimes malformed — since
 * they're never used for tagging. Leaves the rest of the object untouched. */
function stripInternalTagFields(text) {
  return text
    .split("\n")
    .filter((line) => !/["“”](sub)?(category|group)["“”]\s*:/i.test(line))
    .join("\n");
}

function validateQuestion(q, tags) {
  const errors = [];
  if (!Number.isInteger(q.id)) errors.push("id: must be an integer");
  if (![1, 2, 3].includes(q.level)) errors.push(`level: must be 1, 2, or 3 (got ${JSON.stringify(q.level)})`);
  if (!q.question || typeof q.question !== "string" || q.question.trim() === "") errors.push("question: must be a non-empty string");
  if (!Array.isArray(q.answers) || q.answers.length !== 4) {
    errors.push(`answers: must contain exactly 4 entries (got ${Array.isArray(q.answers) ? q.answers.length : typeof q.answers})`);
  } else if (q.answers.some((a) => !a || typeof a !== "string" || a.trim() === "")) {
    errors.push("answers: every answer must be a non-empty string");
  }
  if (![0, 1, 2, 3].includes(q.correct)) errors.push(`correct: must be an integer 0-3 (got ${JSON.stringify(q.correct)})`);
  if (q.media_url !== null && q.media_url !== undefined && q.media_url !== "") {
    if (typeof q.media_url !== "string" || !/^https:\/\//.test(q.media_url)) {
      errors.push(`media_url: must be empty or an https URL (got ${JSON.stringify(q.media_url)})`);
    }
  }
  return errors;
}

async function main() {
  const files = (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json") && f !== "_Index.json");

  const missingMapping = files.filter((f) => !(f.replace(/\.json$/, "") in TAG_MAP));
  if (missingMapping.length > 0) {
    throw new Error(`No TAG_MAP entry for: ${missingMapping.join(", ")}`);
  }

  let nextId = 1;
  const merged = [];
  const failures = [];
  const perFileCounts = {};

  for (const file of files) {
    const key = file.replace(/\.json$/, "");
    const tags = TAG_MAP[key];
    const raw = await readFile(path.join(RAW_DIR, file), "utf-8");
    const cleaned = stripInternalTagFields(raw);

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (err) {
      failures.push(`${file}: JSON parse error — ${err.message}`);
      continue;
    }
    if (!Array.isArray(parsed)) {
      failures.push(`${file}: expected a top-level array`);
      continue;
    }

    let fileCount = 0;
    for (const [i, q] of parsed.entries()) {
      const errors = validateQuestion(q, tags);
      if (errors.length > 0) {
        failures.push(`${file} row ${i + 1} (id=${q?.id ?? "?"}): ${errors.join("; ")}`);
        continue;
      }
      merged.push({
        id: nextId++,
        subcategories: tags,
        level: q.level,
        question: q.question.trim(),
        answers: q.answers.map((a) => a.trim()),
        correct: q.correct,
        media_url: q.media_url && q.media_url.trim() !== "" ? q.media_url.trim() : null,
      });
      fileCount++;
    }
    perFileCounts[file] = fileCount;
  }

  console.log("Per-file accepted question counts:");
  for (const [file, count] of Object.entries(perFileCounts)) {
    console.log(`  ${count.toString().padStart(4)}  ${file}`);
  }

  const imageQuestionsRaw = JSON.parse(await readFile(IMAGE_QUESTIONS_PATH, "utf-8"));
  let imageQuestionCount = 0;
  for (const [i, q] of imageQuestionsRaw.entries()) {
    // No `id` in this source — it's assigned below like every other question.
    const errors = validateQuestion({ ...q, id: 0 }, q.subcategories);
    if (errors.length > 0) {
      failures.push(`image-questions.json row ${i + 1}: ${errors.join("; ")}`);
      continue;
    }
    merged.push({
      id: nextId++,
      subcategories: q.subcategories,
      level: q.level,
      question: q.question.trim(),
      answers: q.answers.map((a) => a.trim()),
      correct: q.correct,
      media_url: q.media_url && q.media_url.trim() !== "" ? q.media_url.trim() : null,
    });
    imageQuestionCount++;
  }
  console.log(`  ${imageQuestionCount.toString().padStart(4)}  image-questions.json (supplemental)`);

  if (failures.length > 0) {
    console.error(`\n✖ ${failures.length} row(s) failed validation and were dropped:\n`);
    for (const f of failures.slice(0, 50)) console.error(`  - ${f}`);
    if (failures.length > 50) console.error(`  ...and ${failures.length - 50} more`);
  }

  if (merged.length === 0) {
    throw new Error("No valid questions produced — aborting without writing output.");
  }

  await writeFile(QUESTIONS_OUT, JSON.stringify(merged, null, 2) + "\n", "utf-8");

  const taxonomy = { topLevel: TOP_LEVEL_TAGS, continents: CONTINENT_TAGS, centuries: [] };
  await writeFile(TAXONOMY_OUT, JSON.stringify(taxonomy, null, 2) + "\n", "utf-8");

  const categories = deriveCategories(merged, taxonomy);
  await writeFile(CATEGORIES_OUT, JSON.stringify(categories, null, 2) + "\n", "utf-8");

  console.log(`\n✔ ${merged.length} questions written to ${path.relative(process.cwd(), QUESTIONS_OUT)}`);
  console.log(`✔ taxonomy written to ${path.relative(process.cwd(), TAXONOMY_OUT)}`);
  console.log(`✔ ${categories.length} categories written to ${path.relative(process.cwd(), CATEGORIES_OUT)}`);

  const ratioCsv = await readFile(RATIO_INDEX_PATH, "utf-8").catch(() => null);
  if (ratioCsv) {
    const { combined, skipped, totalMismatches } = parseCombinedCategoryRatios(ratioCsv, TOP_LEVEL_TAGS, CONTINENT_TAGS);
    await writeFile(COMBINED_CATEGORIES_OUT, JSON.stringify(combined, null, 2) + "\n", "utf-8");
    console.log(`✔ ${Object.keys(combined).length} combined-category ratio sets written to ${path.relative(process.cwd(), COMBINED_CATEGORIES_OUT)}`);
    if (totalMismatches.length > 0) {
      console.error(`\n✖ ${totalMismatches.length} combined categor${totalMismatches.length === 1 ? "y" : "ies"} with ratios not summing to 10:`);
      for (const m of totalMismatches) console.error(`  - ${m}`);
    }
    if (skipped.length > 0) {
      console.log(`\nSkipped ${skipped.length} combined categor${skipped.length === 1 ? "y" : "ies"} not yet mappable to a pickable category:`);
      for (const s of skipped) console.log(`  - ${s}`);
    }
  } else {
    console.log(`\n(no ${path.relative(process.cwd(), RATIO_INDEX_PATH)} found — skipping combined-category ratios)`);
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}\n`);
  process.exit(1);
});
