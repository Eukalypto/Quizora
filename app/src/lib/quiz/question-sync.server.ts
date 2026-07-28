// Daily Cron job: reads the raw-source/*.json files a content curator drops
// into the R2 bucket (same shape as scripts/raw-source/ locally), merges them
// with question-merge.ts (the exact same logic the local script uses), and
// writes the compiled bank back to R2 under compiled/ — which is what
// question-bank.ts actually serves at runtime. No redeploy needed to update
// trivia content; see wrangler.jsonc's triggers.crons for the schedule.
import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";
import { mergeQuestionBank } from "./question-merge";

const RAW_PREFIX = "raw-source/";
const COMPILED_PREFIX = "compiled/";
const IMAGE_QUESTIONS_KEY = `${RAW_PREFIX}image-questions.json`;
const RATIO_INDEX_KEY = `${RAW_PREFIX}_Index.csv`;
// _Index.json is the Drive folder's own listing metadata, not a question
// file — same exclusion as the local script (merge-drive-questions.mjs).
const INDEX_JSON_KEY = `${RAW_PREFIX}_Index.json`;

// Workers cap simultaneous open connections per invocation — fetching all
// ~44 raw-source files in one Promise.all trips "Response closed due to
// connection limit". Stay well under that with a small concurrency window.
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function listAllRawSourceJsonKeys(storage: R2Bucket): Promise<string[]> {
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await storage.list({ prefix: RAW_PREFIX, cursor });
    for (const obj of page.objects) {
      if (!obj.key.endsWith(".json")) continue;
      if (obj.key === IMAGE_QUESTIONS_KEY) continue; // handled separately, isn't a TAG_MAP file
      if (obj.key === INDEX_JSON_KEY) continue;
      keys.push(obj.key);
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

export interface SyncReport {
  ranAt: string;
  ok: boolean;
  questionCount?: number;
  categoryCount?: number;
  perFileCounts?: Record<string, number>;
  failures?: string[];
  skippedRatioBlocks?: string[];
  ratioTotalMismatches?: string[];
  error?: string;
}

export async function syncQuestionBankFromR2(storage: R2Bucket): Promise<SyncReport> {
  const ranAt = new Date().toISOString();
  try {
    const questionFileKeys = await listAllRawSourceJsonKeys(storage);

    const files = await mapWithConcurrency(questionFileKeys, 5, async (key) => {
      const obj = await storage.get(key);
      if (!obj) throw new Error(`R2 object disappeared mid-sync: ${key}`);
      const name = key.slice(RAW_PREFIX.length).replace(/\.json$/, "");
      return { name, content: await (obj as R2ObjectBody).text() };
    });

    const imageQuestionsObj = await storage.get(IMAGE_QUESTIONS_KEY);
    if (!imageQuestionsObj) {
      throw new Error(`Missing required ${IMAGE_QUESTIONS_KEY} in R2`);
    }
    const imageQuestionsRaw = await (imageQuestionsObj as R2ObjectBody).text();

    const ratioObj = await storage.get(RATIO_INDEX_KEY);
    const ratioCsv = ratioObj ? await (ratioObj as R2ObjectBody).text() : null;

    const result = mergeQuestionBank({ files, imageQuestionsRaw, ratioCsv });

    await Promise.all([
      storage.put(`${COMPILED_PREFIX}questions.json`, JSON.stringify(result.questions)),
      storage.put(`${COMPILED_PREFIX}taxonomy.json`, JSON.stringify(result.taxonomy)),
      storage.put(`${COMPILED_PREFIX}categories.json`, JSON.stringify(result.categories)),
      storage.put(`${COMPILED_PREFIX}combined-categories.json`, JSON.stringify(result.combinedCategories)),
    ]);

    const report: SyncReport = {
      ranAt,
      ok: true,
      questionCount: result.questions.length,
      categoryCount: result.categories.length,
      perFileCounts: result.perFileCounts,
      failures: result.failures,
      skippedRatioBlocks: result.skippedRatioBlocks,
      ratioTotalMismatches: result.ratioTotalMismatches,
    };
    await storage.put(`${COMPILED_PREFIX}sync-report.json`, JSON.stringify(report, null, 2));
    return report;
  } catch (error) {
    const report: SyncReport = { ranAt, ok: false, error: error instanceof Error ? error.message : String(error) };
    // Best-effort — if R2 itself is the thing failing, this may also fail, which is fine (falls through to caller's own logging).
    await storage.put(`${COMPILED_PREFIX}sync-report.json`, JSON.stringify(report, null, 2)).catch(() => {});
    return report;
  }
}
