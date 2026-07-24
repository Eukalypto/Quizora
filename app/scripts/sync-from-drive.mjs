#!/usr/bin/env bun
// Daily Drive sync: fetches every file in the shared Drive folder (via the
// Apps Script Web App bound to it — see the folder's `- Index.csv` sibling
// for the deployed script), writes them into scripts/raw-source/ exactly
// like a manual export would, then runs the existing merge pipeline so
// questions.json/categories.json/combined-categories.json stay current.
//
// This script only updates local files — committing, pushing, and
// redeploying is done by whoever/whatever runs this (see the scheduled
// task's prompt), not by this script itself.
//
// Run: bun run scripts/sync-from-drive.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, "raw-source");

// Public, read-only — returns { [filename]: content } for every file
// directly inside the shared Drive folder. Content is either raw text
// (plain .json/.csv files) or a 2D array of row values (a native Google
// Sheet, e.g. if the index is later converted to one instead of a plain
// .csv) — see the Apps Script source for exactly what it returns.
const DRIVE_BUNDLE_URL =
  "https://script.google.com/macros/s/AKfycbxw4k_bhg_DzUePd7kfc07AMORoiW9sD5hbbSZI8clxjVg8kdtsbeQvuv4ukOT_l5Vu7w/exec";

function rowsToSemicolonCsv(rows) {
  return rows.map((row) => row.map((cell) => String(cell)).join(";")).join("\n") + "\n";
}

async function main() {
  console.log(`Fetching ${DRIVE_BUNDLE_URL} ...`);
  const res = await fetch(DRIVE_BUNDLE_URL);
  if (!res.ok) {
    throw new Error(`Drive bundle fetch failed: ${res.status} ${res.statusText}`);
  }
  const bundle = await res.json();
  const filenames = Object.keys(bundle);
  if (filenames.length === 0) {
    throw new Error("Drive bundle returned zero files — aborting without touching raw-source/");
  }

  await mkdir(RAW_DIR, { recursive: true });

  let written = 0;
  for (const [name, content] of Object.entries(bundle)) {
    // A native Google Sheet comes back as a 2D array of row values instead
    // of text — re-serialize it into the same semicolon-CSV shape the
    // ratio parser already expects, so either source format (plain
    // uploaded .csv or a converted Sheet) works without changing
    // merge-drive-questions.mjs.
    const isIndexSheet = Array.isArray(content);
    const outName = isIndexSheet ? "_Index.csv" : name;
    const outContent = isIndexSheet ? rowsToSemicolonCsv(content) : content;
    await writeFile(path.join(RAW_DIR, outName), outContent, "utf-8");
    written++;
  }
  console.log(`✔ wrote ${written} file(s) to ${path.relative(process.cwd(), RAW_DIR)}`);

  // The plain-CSV index path (today's setup) arrives under its real Drive
  // filename ("- Index.csv"), not the "_Index.csv" the merge script reads
  // — normalize it so merge-drive-questions.mjs finds it either way.
  if (bundle["- Index.csv"] && !bundle["_Index.csv"]) {
    await writeFile(path.join(RAW_DIR, "_Index.csv"), bundle["- Index.csv"], "utf-8");
  }

  console.log("\nRunning merge-drive-questions.mjs ...");
  execSync("bun run scripts/merge-drive-questions.mjs", { cwd: path.join(__dirname, ".."), stdio: "inherit" });
}

main().catch((err) => {
  console.error(`\n✖ ${err.message}\n`);
  process.exit(1);
});
