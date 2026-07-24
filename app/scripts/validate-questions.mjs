#!/usr/bin/env bun
// Standalone question-bank build script. NOT part of the app runtime — run it
// manually (`bun run validate-questions`) whenever the question sheet changes.
//
// Source selection:
//   - If QUESTIONS_SHEET_CSV_URL is set, pulls rows from that published-CSV
//     export of the Google Sheet (File > Share > Publish to web > CSV). This
//     is the lower-friction path — no service account / OAuth needed. Ask
//     Marc for this URL once the sheet exists; until then the script falls
//     back to the mock source below.
//   - Otherwise, reads app/src/data/questions.mock.json (the ~40-row mock set
//     standing in for the sheet during v1).
//
// Expected CSV header (one row per question):
//   id,subcategories,level,question,answer1,answer2,answer3,answer4,correct,media_url
//   - subcategories: semicolon-separated tags, e.g. "history;europe;15th-century"
//   - level: 1|2|3
//   - correct: 0-3 (index into answer1..answer4)
//   - media_url: absolute https URL, or empty
//
// On success: writes app/src/data/questions.json (pretty JSON), exits 0.
// On any validation failure: prints every failing row + reason, writes
// nothing, exits 1. All-or-nothing — never a partially-valid file.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "src", "data");
const TAXONOMY_PATH = path.join(DATA_DIR, "taxonomy.json");
const MOCK_SOURCE_PATH = path.join(DATA_DIR, "questions.mock.json");
const OUTPUT_PATH = path.join(DATA_DIR, "questions.json");

const SHEET_CSV_URL = process.env.QUESTIONS_SHEET_CSV_URL;

/** Minimal RFC4180 CSV parser (quoted fields, escaped quotes, embedded commas/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function csvRowsToQuestions(rows) {
  const [header, ...body] = rows;
  const col = (name) => header.indexOf(name);
  const idx = {
    id: col("id"),
    subcategories: col("subcategories"),
    level: col("level"),
    question: col("question"),
    a1: col("answer1"),
    a2: col("answer2"),
    a3: col("answer3"),
    a4: col("answer4"),
    correct: col("correct"),
    media_url: col("media_url"),
  };
  const missingCols = Object.entries(idx)
    .filter(([, i]) => i === -1)
    .map(([name]) => name);
  if (missingCols.length > 0) {
    throw new Error(`CSV is missing required column(s): ${missingCols.join(", ")}`);
  }

  return body.map((r) => ({
    id: Number(r[idx.id]),
    subcategories: (r[idx.subcategories] ?? "")
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean),
    level: Number(r[idx.level]),
    question: r[idx.question] ?? "",
    answers: [r[idx.a1], r[idx.a2], r[idx.a3], r[idx.a4]],
    correct: Number(r[idx.correct]),
    media_url: r[idx.media_url] && r[idx.media_url].trim() !== "" ? r[idx.media_url].trim() : null,
  }));
}

async function loadSource() {
  if (SHEET_CSV_URL) {
    console.log(`Pulling questions from sheet: ${SHEET_CSV_URL}`);
    const res = await fetch(SHEET_CSV_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch sheet CSV: HTTP ${res.status}`);
    }
    const text = await res.text();
    return csvRowsToQuestions(parseCsv(text));
  }
  console.log(
    `QUESTIONS_SHEET_CSV_URL not set — using mock source at ${path.relative(process.cwd(), MOCK_SOURCE_PATH)}`,
  );
  const raw = await readFile(MOCK_SOURCE_PATH, "utf-8");
  return JSON.parse(raw);
}

async function loadTaxonomy() {
  const raw = await readFile(TAXONOMY_PATH, "utf-8");
  const taxonomy = JSON.parse(raw);
  const validTags = new Set([
    ...(taxonomy.topLevel ?? []),
    ...(taxonomy.continents ?? []),
    ...(taxonomy.centuries ?? []),
  ]);
  return validTags;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function mediaUrlResolves(url, attempt = 0) {
  try {
    const res = await fetch(url, { method: "HEAD", redirect: "follow" });
    if (res.ok) return true;
    if (res.status === 429 && attempt < 2) {
      await sleep(500 * (attempt + 1));
      return mediaUrlResolves(url, attempt + 1);
    }
    // Some hosts reject HEAD; fall back to a ranged GET before declaring it broken.
    const getRes = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" } });
    return getRes.ok;
  } catch {
    return false;
  }
}

/** Resolve media URLs one host-group at a time, serially within a group, to
 * avoid tripping per-host rate limits (e.g. Wikimedia) on large batches. */
async function resolveAllMedia(questions) {
  const byHost = new Map();
  for (const q of questions) {
    const host = new URL(q.media_url).host;
    if (!byHost.has(host)) byHost.set(host, []);
    byHost.get(host).push(q);
  }
  const results = [];
  await Promise.all(
    [...byHost.values()].map(async (group) => {
      for (const q of group) {
        results.push({ q, ok: await mediaUrlResolves(q.media_url) });
        await sleep(120);
      }
    }),
  );
  return results;
}

function validateQuestion(q, validTags) {
  const errors = [];

  if (q.id === undefined || q.id === null || Number.isNaN(q.id) || !Number.isInteger(q.id)) {
    errors.push("id: must be a unique integer");
  }
  if (!Array.isArray(q.subcategories) || q.subcategories.length === 0) {
    errors.push("subcategories: must be a non-empty array");
  } else {
    for (const tag of q.subcategories) {
      if (!validTags.has(tag)) {
        errors.push(`subcategories: unknown tag "${tag}" (not in taxonomy.json)`);
      }
    }
  }
  if (![1, 2, 3].includes(q.level)) {
    errors.push("level: must be 1, 2, or 3");
  }
  if (!q.question || typeof q.question !== "string" || q.question.trim() === "") {
    errors.push("question: must be a non-empty string");
  }
  if (!Array.isArray(q.answers) || q.answers.length !== 4) {
    errors.push("answers: must contain exactly 4 entries");
  } else if (q.answers.some((a) => !a || typeof a !== "string" || a.trim() === "")) {
    errors.push("answers: every answer must be a non-empty string");
  }
  if (![0, 1, 2, 3].includes(q.correct)) {
    errors.push("correct: must be an integer 0-3");
  }
  if (q.media_url !== null && q.media_url !== undefined) {
    if (typeof q.media_url !== "string" || !/^https:\/\//.test(q.media_url)) {
      errors.push("media_url: must be null or an https URL");
    }
  }

  return errors;
}

async function main() {
  const validTags = await loadTaxonomy();
  const questions = await loadSource();

  const failures = [];
  const seenIds = new Map();

  for (const [rowIndex, q] of questions.entries()) {
    const rowLabel = `row ${rowIndex + 1} (id=${q?.id ?? "?"})`;
    const errors = validateQuestion(q, validTags);

    if (q?.id !== undefined && q?.id !== null) {
      if (seenIds.has(q.id)) {
        errors.push(`id: duplicate of ${seenIds.get(q.id)}`);
      } else {
        seenIds.set(q.id, rowLabel);
      }
    }

    if (errors.length > 0) {
      failures.push({ rowLabel, errors });
    }
  }

  // media_url resolution — only for rows that otherwise passed schema checks,
  // run concurrently.
  const toCheck = questions.filter(
    (q, i) => !failures.some((f) => f.rowLabel.startsWith(`row ${i + 1} `)) && q.media_url,
  );
  const mediaResults = await resolveAllMedia(toCheck);
  for (const { q, ok } of mediaResults) {
    if (!ok) {
      const rowIndex = questions.indexOf(q);
      failures.push({
        rowLabel: `row ${rowIndex + 1} (id=${q.id})`,
        errors: [`media_url: does not resolve (non-2xx): ${q.media_url}`],
      });
    }
  }

  if (failures.length > 0) {
    console.error(`\n✖ Validation failed: ${failures.length} row(s) with errors.\n`);
    for (const { rowLabel, errors } of failures) {
      console.error(`  ${rowLabel}`);
      for (const err of errors) console.error(`    - ${err}`);
    }
    console.error(`\nWrote nothing. Fix the sheet and re-run.\n`);
    process.exit(1);
  }

  await writeFile(OUTPUT_PATH, JSON.stringify(questions, null, 2) + "\n", "utf-8");
  console.log(`\n✔ ${questions.length} questions validated. Wrote ${path.relative(process.cwd(), OUTPUT_PATH)}\n`);
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}\n`);
  process.exit(1);
});
