import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import {
  buildDailySetForUser,
  buildFreePlaySetForUser,
  buildWeeklySetShared,
  getUserSnapshot,
  pickMultiplayerQuestionsForUser,
  submitGameResult,
} from "@/lib/quiz/db.server";
import type { Question } from "@/lib/categories";

class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

async function requireUserAndDb() {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new UnauthorizedError();
  const { DB } = bindings();
  if (!DB) throw new Error("D1 binding missing — check app.manifest.json");
  return { userId: auth.user.id, db: DB };
}

export const getSnapshot = createServerFn({ method: "GET" }).handler(async () => {
  const { userId, db } = await requireUserAndDb();
  return getUserSnapshot(db, userId);
});

export const startDaily = createServerFn({ method: "POST" }).handler(async (): Promise<Question[]> => {
  const { userId, db } = await requireUserAndDb();
  return buildDailySetForUser(db, userId);
});

export const startWeekly = createServerFn({ method: "POST" }).handler(async (): Promise<Question[]> => {
  const { db } = await requireUserAndDb();
  return buildWeeklySetShared(db);
});

const startFreePlayInput = z.object({
  categoryTags: z.array(z.string()).min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const startFreePlay = createServerFn({ method: "POST" })
  .validator(startFreePlayInput)
  .handler(async ({ data }): Promise<Question[]> => {
    const { userId, db } = await requireUserAndDb();
    return buildFreePlaySetForUser(db, userId, data.categoryTags, data.level);
  });

const startMultiplayerRoundInput = z.object({
  teamCategoryTags: z.array(z.array(z.array(z.string()))).min(1),
  difficulty: z.union([z.literal("easy"), z.literal("medium"), z.literal("hard")]),
  count: z.number().int().min(1).max(20),
});

export const startMultiplayerRound = createServerFn({ method: "POST" })
  .validator(startMultiplayerRoundInput)
  .handler(async ({ data }): Promise<Question[][]> => {
    const { userId, db } = await requireUserAndDb();
    return Promise.all(
      data.teamCategoryTags.map((tagGroups) =>
        pickMultiplayerQuestionsForUser(db, userId, tagGroups, data.difficulty, data.count),
      ),
    );
  });

const submitResultInput = z.object({
  mode: z.union([z.literal("daily"), z.literal("weekly"), z.literal("freeplay")]),
  categoryLabel: z.string().optional(),
  correct: z.number().int().min(0),
  total: z.number().int().min(0),
  timeBonusTotal: z.number().int().min(0).optional(),
  questionIds: z.array(z.number().int()),
});

export const submitResult = createServerFn({ method: "POST" })
  .validator(submitResultInput)
  .handler(async ({ data }) => {
    const { userId, db } = await requireUserAndDb();
    return submitGameResult(db, userId, data);
  });
