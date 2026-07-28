// Loads the question bank at runtime from R2 (see question-sync.server.ts for
// how it gets there — a daily Cron job merges scripts/raw-source-shaped JSON
// files dropped in the R2 bucket into these compiled objects, no redeploy
// needed to update trivia content). Cached per-isolate with a TTL; falls back
// to the build-time bundled JSON when R2 isn't reachable — that's always true
// under plain `vite dev` (Node/Bun, no Workers runtime — same reason
// src/start.ts builds its `cloudflare:workers` specifier from parts instead of
// a literal, see that file's comment) and is also the correct behavior before
// the bucket has ever been synced.
//
// Server-only: nothing client-side may import this (would need bindings this
// module doesn't have in the browser). Client code needing categories/taxonomy
// uses src/lib/category-list.ts / the taxonomy import in quiz/badges.ts instead.
import questionsJson from "@/data/questions.json";
import taxonomyJson from "@/data/taxonomy.json";
import categoriesJson from "@/data/categories.json";
import combinedCategoriesJson from "@/data/combined-categories.json";
import { type Category, type Question } from "@/lib/categories";
import type { RatioComponent, Taxonomy } from "@/lib/quiz/question-merge";
import type { R2Bucket, R2ObjectBody } from "@cloudflare/workers-types";

export type { Question, Category, Taxonomy, RatioComponent };

export interface QuestionBank {
  questions: Question[];
  taxonomy: Taxonomy;
  categories: Category[];
  combinedCategories: Record<string, RatioComponent[]>;
}

const FALLBACK_BANK: QuestionBank = {
  questions: questionsJson as Question[],
  taxonomy: taxonomyJson as Taxonomy,
  categories: categoriesJson as Category[],
  combinedCategories: combinedCategoriesJson as unknown as Record<string, RatioComponent[]>,
};

const CLOUDFLARE_WORKERS_MODULE = ["cloudflare", "workers"].join(":");
const COMPILED_PREFIX = "compiled/";
const TTL_MS = 60 * 60 * 1000; // re-check R2 at most once an hour per isolate

let cache: { bank: QuestionBank; fetchedAt: number } | undefined;
let inFlight: Promise<QuestionBank> | undefined;

async function fetchCompiledFromR2(): Promise<QuestionBank | null> {
  let mod: { env?: Record<string, unknown> };
  try {
    mod = (await import(CLOUDFLARE_WORKERS_MODULE)) as { env?: Record<string, unknown> };
  } catch {
    return null; // not running on Workers (e.g. plain `vite dev`)
  }
  const storage = mod.env?.STORAGE as R2Bucket | undefined;
  if (!storage) return null; // R2 not bound yet (bucket not provisioned/attached)

  const [questionsObj, taxonomyObj, categoriesObj, combinedObj] = await Promise.all([
    storage.get(`${COMPILED_PREFIX}questions.json`),
    storage.get(`${COMPILED_PREFIX}taxonomy.json`),
    storage.get(`${COMPILED_PREFIX}categories.json`),
    storage.get(`${COMPILED_PREFIX}combined-categories.json`),
  ]);
  if (!questionsObj || !taxonomyObj || !categoriesObj) return null; // never synced yet

  const [questions, taxonomy, categories, combinedCategories] = await Promise.all([
    (questionsObj as R2ObjectBody).json<Question[]>(),
    (taxonomyObj as R2ObjectBody).json<Taxonomy>(),
    (categoriesObj as R2ObjectBody).json<Category[]>(),
    combinedObj ? (combinedObj as R2ObjectBody).json<Record<string, RatioComponent[]>>() : Promise.resolve({}),
  ]);
  return { questions, taxonomy, categories, combinedCategories };
}

/** The single entry point every question-selection function should call. */
export async function getQuestionBank(): Promise<QuestionBank> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.bank;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const fromR2 = await fetchCompiledFromR2();
      const bank = fromR2 ?? FALLBACK_BANK;
      cache = { bank, fetchedAt: Date.now() };
      return bank;
    } finally {
      inFlight = undefined;
    }
  })();
  return inFlight;
}

export async function getQuestionById(id: number): Promise<Question | undefined> {
  const { questions } = await getQuestionBank();
  return questions.find((q) => q.id === id);
}
