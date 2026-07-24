// Loads the build-time question bank once and memoizes the derived category
// list. Safe to import from both server and client code — it's plain static
// JSON, no bindings/env involved.
import questionsJson from "@/data/questions.json";
import taxonomyJson from "@/data/taxonomy.json";
import { deriveCategories, type Category, type Question } from "@/lib/categories";

export const ALL_QUESTIONS = questionsJson as Question[];
export const TAXONOMY = taxonomyJson as {
  topLevel: string[];
  continents: string[];
  centuries: string[];
};

// Computed once at module init (recomputes only when questions.json changes
// and the app rebuilds) — never recomputed per request.
export const ALL_CATEGORIES: Category[] = deriveCategories(ALL_QUESTIONS, TAXONOMY);

export function getQuestionById(id: number): Question | undefined {
  return ALL_QUESTIONS.find((q) => q.id === id);
}
