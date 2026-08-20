#!/usr/bin/env bun
// One-shot ingestion of the real Drive-sourced question bank into
// src/data/questions.json + src/data/taxonomy.json, replacing the mock set.
//
// Source: app/scripts/raw-source/*.json — one file per (Group, Subgroup)
// pair, fetched verbatim from the shared Drive folder, plus the Subject
// index (_Index.csv). Each file's own internal group/subgroup fields are
// matched against the index — not the filename — to determine its Subject
// identity, tags, and question ids; see parseSubjectIndex in
// src/lib/quiz/question-merge.ts.
//
// The actual merge/validate/tag logic lives in that shared, isomorphic
// module — this script is just the local-disk I/O wrapper around it. The
// same module also backs the Worker's daily R2-based Cron sync (see
// src/lib/quiz/question-sync.server.ts), so both paths stay identical.
//
// Run: bun run scripts/merge-drive-questions.mjs

import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mergeQuestionBank } from "../src/lib/quiz/question-merge.ts";

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
// categories).
const RATIO_INDEX_PATH = path.join(RAW_DIR, "_Index.csv");
const COMBINED_CATEGORIES_OUT = path.join(DATA_DIR, "combined-categories.json");

async function main() {
  const filenames = (await readdir(RAW_DIR)).filter((f) => f.endsWith(".json") && f !== "_Index.json");
  const files = await Promise.all(
    filenames.map(async (f) => ({
      name: f.replace(/\.json$/, ""),
      content: await readFile(path.join(RAW_DIR, f), "utf-8"),
    })),
  );

  const imageQuestionsRaw = await readFile(IMAGE_QUESTIONS_PATH, "utf-8");
  const ratioCsv = await readFile(RATIO_INDEX_PATH, "utf-8").catch(() => null);

  const result = mergeQuestionBank({ files, imageQuestionsRaw, ratioCsv });

  console.log("Per-file accepted question counts:");
  for (const [file, count] of Object.entries(result.perFileCounts)) {
    console.log(`  ${count.toString().padStart(4)}  ${file}`);
  }

  if (result.failures.length > 0) {
    console.error(`\n✖ ${result.failures.length} row(s) failed validation and were dropped:\n`);
    for (const f of result.failures.slice(0, 50)) console.error(`  - ${f}`);
    if (result.failures.length > 50) console.error(`  ...and ${result.failures.length - 50} more`);
  }

  if (result.unmatchedFiles.length > 0) {
    console.log(`\n${result.unmatchedFiles.length} file(s) had no matching index row (group/subgroup spelling drift?) — skipped:`);
    for (const f of result.unmatchedFiles) console.log(`  - ${f}`);
  }
  if (result.indexOnlySubjects.length > 0) {
    console.log(`\n${result.indexOnlySubjects.length} index Subject(s) with no matching file — not displayed:`);
    for (const s of result.indexOnlySubjects) console.log(`  - ${s}`);
  }

  await writeFile(QUESTIONS_OUT, JSON.stringify(result.questions, null, 2) + "\n", "utf-8");
  await writeFile(TAXONOMY_OUT, JSON.stringify(result.taxonomy, null, 2) + "\n", "utf-8");
  await writeFile(CATEGORIES_OUT, JSON.stringify(result.categories, null, 2) + "\n", "utf-8");

  console.log(`\n✔ ${result.questions.length} questions written to ${path.relative(process.cwd(), QUESTIONS_OUT)}`);
  console.log(`✔ taxonomy written to ${path.relative(process.cwd(), TAXONOMY_OUT)}`);
  console.log(`✔ ${result.categories.length} categories written to ${path.relative(process.cwd(), CATEGORIES_OUT)}`);

  if (ratioCsv) {
    await writeFile(COMBINED_CATEGORIES_OUT, JSON.stringify(result.combinedCategories, null, 2) + "\n", "utf-8");
    console.log(`✔ ${Object.keys(result.combinedCategories).length} combined-category ratio sets written to ${path.relative(process.cwd(), COMBINED_CATEGORIES_OUT)}`);
    if (result.ratioTotalMismatches.length > 0) {
      console.error(`\n✖ ${result.ratioTotalMismatches.length} combined categor${result.ratioTotalMismatches.length === 1 ? "y" : "ies"} with ratios not summing to 10:`);
      for (const m of result.ratioTotalMismatches) console.error(`  - ${m}`);
    }
  } else {
    console.log(`\n(no ${path.relative(process.cwd(), RATIO_INDEX_PATH)} found — skipping combined-category ratios)`);
  }
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}\n`);
  process.exit(1);
});
