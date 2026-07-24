import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import {
  createChallengeAndStartRound1,
  getChallengeState,
  getMyChallenges,
  getRound2Questions,
  joinChallengeAndPlayRound1,
  startRound2,
  submitRound1,
  submitRound2,
} from "@/lib/quiz/challenge.server";

async function requireUserAndDb() {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new Error("unauthorized");
  const { DB } = bindings();
  if (!DB) throw new Error("D1 binding missing");
  return { user: auth.user, db: DB };
}

const categoryInput = z.object({ categoryKey: z.string().min(1) });

export const createChallengeFn = createServerFn({ method: "POST" })
  .validator(categoryInput)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    return createChallengeAndStartRound1(db, user, data.categoryKey);
  });

const idInput = z.object({ id: z.string().min(1) });

export const joinChallengeFn = createServerFn({ method: "POST" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    return joinChallengeAndPlayRound1(db, user, data.id);
  });

export const getChallengeStateFn = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    return getChallengeState(db, user.id, data.id);
  });

const resultInput = z.object({ id: z.string().min(1), correct: z.number().int().min(0), total: z.number().int().min(0), score: z.number().int().min(0) });

export const submitRound1Fn = createServerFn({ method: "POST" })
  .validator(resultInput)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    return submitRound1(db, user.id, data.id, { correct: data.correct, total: data.total, score: data.score });
  });

export const submitRound2Fn = createServerFn({ method: "POST" })
  .validator(resultInput)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    return submitRound2(db, user.id, data.id, { correct: data.correct, total: data.total, score: data.score });
  });

const startRound2Input = z.object({ id: z.string().min(1), categoryKey: z.string().min(1) });

export const startRound2Fn = createServerFn({ method: "POST" })
  .validator(startRound2Input)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    return startRound2(db, user.id, data.id, data.categoryKey);
  });

export const getRound2QuestionsFn = createServerFn({ method: "GET" })
  .validator(idInput)
  .handler(async ({ data }) => {
    const { user, db } = await requireUserAndDb();
    const questions = await getRound2Questions(db, user.id, data.id);
    return { questions };
  });

export const getMyChallengesFn = createServerFn({ method: "GET" }).handler(async () => {
  const { user, db } = await requireUserAndDb();
  return getMyChallenges(db, user.id);
});
