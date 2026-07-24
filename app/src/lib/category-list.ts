// Client-safe category list — precomputed at ingestion time (see
// scripts/merge-drive-questions.mjs) so UI code that only needs to render the
// category picker doesn't pull the full ~11k-question bank into the browser
// bundle. Never import ALL_QUESTIONS/question-bank.ts from client components;
// use this module instead. Server code (server functions, db.server.ts) can
// still import question-bank.ts directly — bundle size doesn't matter there.
import categoriesJson from "@/data/categories.json";
import type { Category } from "@/lib/categories";

export const ALL_CATEGORIES = categoriesJson as Category[];
