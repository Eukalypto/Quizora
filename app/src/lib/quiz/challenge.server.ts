import type { D1Database } from "@cloudflare/workers-types";
import type { AuthenticatedUser } from "@/lib/auth.server";
import { ALL_CATEGORIES } from "@/lib/category-list";
import type { Question } from "@/lib/categories";
import { getQuestionBank } from "@/lib/question-bank";
import { buildChallengeRoundQuestions, CHALLENGE_INVITE_TTL_HOURS, generateChallengeId } from "./challenge";

interface ChallengeRow {
  id: string;
  creator_user_id: string;
  creator_name: string | null;
  creator_platform_avatar: string | null;
  opponent_user_id: string | null;
  opponent_name: string | null;
  opponent_platform_avatar: string | null;
  round1_category_key: string;
  round1_question_ids: string;
  round1_creator_correct: number | null;
  round1_creator_total: number | null;
  round1_creator_score: number | null;
  round1_creator_completed_at: string | null;
  round1_opponent_correct: number | null;
  round1_opponent_total: number | null;
  round1_opponent_score: number | null;
  round1_opponent_completed_at: string | null;
  round2_category_key: string | null;
  round2_question_ids: string | null;
  round2_opponent_correct: number | null;
  round2_opponent_total: number | null;
  round2_opponent_score: number | null;
  round2_opponent_completed_at: string | null;
  round2_creator_correct: number | null;
  round2_creator_total: number | null;
  round2_creator_score: number | null;
  round2_creator_completed_at: string | null;
  created_at: string;
  expires_at: string;
}

function tagsForCategoryKey(key: string): string[] | null {
  return ALL_CATEGORIES.find((c) => c.key === key)?.tags ?? null;
}

function categoryLabel(key: string | null): string | null {
  return key ? (ALL_CATEGORIES.find((c) => c.key === key)?.label ?? key) : null;
}

async function questionsFromIds(idsJson: string): Promise<Question[]> {
  const ids = JSON.parse(idsJson) as number[];
  const { questions } = await getQuestionBank();
  const byId = new Map(questions.map((q) => [q.id, q]));
  return ids.map((id) => byId.get(id)).filter((q): q is Question => q != null);
}

async function loadChallenge(db: D1Database, id: string): Promise<ChallengeRow | null> {
  return db.prepare(`SELECT * FROM quiz_challenges WHERE id = ?`).bind(id).first<ChallengeRow>();
}

function isExpired(row: ChallengeRow): boolean {
  return row.opponent_user_id == null && new Date(`${row.expires_at.replace(" ", "T")}Z`).getTime() < Date.now();
}

export async function createChallengeAndStartRound1(
  db: D1Database,
  user: AuthenticatedUser,
  categoryKey: string,
): Promise<{ ok: true; id: string; questions: Question[] } | { ok: false; error: "unknown_category" }> {
  const tags = tagsForCategoryKey(categoryKey);
  if (!tags) return { ok: false, error: "unknown_category" };

  const questions = await buildChallengeRoundQuestions(tags);
  const id = generateChallengeId();
  await db
    .prepare(
      `INSERT INTO quiz_challenges (id, creator_user_id, creator_name, creator_platform_avatar, round1_category_key, round1_question_ids, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now', '+${CHALLENGE_INVITE_TTL_HOURS} hours'))`,
    )
    .bind(id, user.id, user.name ?? null, user.avatar_url ?? null, categoryKey, JSON.stringify(questions.map((q) => q.id)))
    .run();

  return { ok: true, id, questions };
}

export type JoinChallengeError = "not_found" | "expired" | "already_full" | "own_challenge" | "already_played";

/** Opponent joins and immediately plays Round 1 — the fixed set the creator
 * already played, no category choice here (that only happens for Round 2). */
export async function joinChallengeAndPlayRound1(
  db: D1Database,
  user: AuthenticatedUser,
  id: string,
): Promise<{ ok: true; questions: Question[] } | { ok: false; error: JoinChallengeError }> {
  const row = await loadChallenge(db, id);
  if (!row) return { ok: false, error: "not_found" };
  if (row.creator_user_id === user.id) return { ok: false, error: "own_challenge" };
  if (row.opponent_user_id && row.opponent_user_id !== user.id) return { ok: false, error: "already_full" };
  if (row.opponent_user_id === user.id && row.round1_opponent_completed_at) return { ok: false, error: "already_played" };
  if (isExpired(row)) return { ok: false, error: "expired" };

  if (!row.opponent_user_id) {
    await db
      .prepare(`UPDATE quiz_challenges SET opponent_user_id = ?, opponent_name = ?, opponent_platform_avatar = ? WHERE id = ? AND opponent_user_id IS NULL`)
      .bind(user.id, user.name ?? null, user.avatar_url ?? null, id)
      .run();
  }

  return { ok: true, questions: await questionsFromIds(row.round1_question_ids) };
}

interface RoundResult {
  correct: number;
  total: number;
  score: number;
}

export async function submitRound1(
  db: D1Database,
  userId: string,
  id: string,
  result: RoundResult,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "not_your_challenge" }> {
  const row = await loadChallenge(db, id);
  if (!row) return { ok: false, error: "not_found" };

  if (row.creator_user_id === userId) {
    await db
      .prepare(`UPDATE quiz_challenges SET round1_creator_correct = ?, round1_creator_total = ?, round1_creator_score = ?, round1_creator_completed_at = datetime('now') WHERE id = ?`)
      .bind(result.correct, result.total, result.score, id)
      .run();
    return { ok: true };
  }
  if (row.opponent_user_id === userId) {
    await db
      .prepare(`UPDATE quiz_challenges SET round1_opponent_correct = ?, round1_opponent_total = ?, round1_opponent_score = ?, round1_opponent_completed_at = datetime('now') WHERE id = ?`)
      .bind(result.correct, result.total, result.score, id)
      .run();
    return { ok: true };
  }
  return { ok: false, error: "not_your_challenge" };
}

export type StartRound2Error = "not_found" | "not_your_challenge" | "not_ready" | "already_started" | "unknown_category";

/** Only the opponent starts Round 2, and only after finishing Round 1. */
export async function startRound2(
  db: D1Database,
  userId: string,
  id: string,
  categoryKey: string,
): Promise<{ ok: true; questions: Question[] } | { ok: false; error: StartRound2Error }> {
  const row = await loadChallenge(db, id);
  if (!row) return { ok: false, error: "not_found" };
  if (row.opponent_user_id !== userId) return { ok: false, error: "not_your_challenge" };
  if (!row.round1_opponent_completed_at) return { ok: false, error: "not_ready" };
  if (row.round2_question_ids) return { ok: false, error: "already_started" };

  const tags = tagsForCategoryKey(categoryKey);
  if (!tags) return { ok: false, error: "unknown_category" };
  const questions = await buildChallengeRoundQuestions(tags);

  await db
    .prepare(`UPDATE quiz_challenges SET round2_category_key = ?, round2_question_ids = ? WHERE id = ? AND round2_question_ids IS NULL`)
    .bind(categoryKey, JSON.stringify(questions.map((q) => q.id)), id)
    .run();

  return { ok: true, questions };
}

export async function submitRound2(
  db: D1Database,
  userId: string,
  id: string,
  result: RoundResult,
): Promise<{ ok: true } | { ok: false; error: "not_found" | "not_your_challenge" }> {
  const row = await loadChallenge(db, id);
  if (!row) return { ok: false, error: "not_found" };

  if (row.opponent_user_id === userId) {
    await db
      .prepare(`UPDATE quiz_challenges SET round2_opponent_correct = ?, round2_opponent_total = ?, round2_opponent_score = ?, round2_opponent_completed_at = datetime('now') WHERE id = ?`)
      .bind(result.correct, result.total, result.score, id)
      .run();
    return { ok: true };
  }
  if (row.creator_user_id === userId) {
    await db
      .prepare(`UPDATE quiz_challenges SET round2_creator_correct = ?, round2_creator_total = ?, round2_creator_score = ?, round2_creator_completed_at = datetime('now') WHERE id = ?`)
      .bind(result.correct, result.total, result.score, id)
      .run();
    return { ok: true };
  }
  return { ok: false, error: "not_your_challenge" };
}

/** Either player can need to (re-)fetch Round 2's fixed question set: the
 * creator plays it once the opponent has set it up; a player who navigates
 * away mid-round and comes back needs it read back rather than rebuilt. */
export async function getRound2Questions(db: D1Database, userId: string, id: string): Promise<Question[] | null> {
  const row = await loadChallenge(db, id);
  if (!row || (row.creator_user_id !== userId && row.opponent_user_id !== userId) || !row.round2_question_ids) return null;
  return await questionsFromIds(row.round2_question_ids);
}

export interface RoundSideState {
  completed: boolean;
  correct: number | null;
  total: number | null;
  score: number | null;
}

export interface JoinedChallengeState {
  kind: "joined";
  id: string;
  isCreator: boolean;
  expiresAt: string;
  opponentName: string | null;
  opponentAvatar: string | null;
  round1: { categoryLabel: string; me: RoundSideState; opponent: RoundSideState };
  round2:
    | null
    | {
        categoryLabel: string;
        // "me"/"opponent" here always mean this viewer vs the other player,
        // regardless of who set round 2 up.
        me: RoundSideState;
        opponent: RoundSideState;
      };
}

export type ChallengeStateResult =
  | { kind: "not_found" }
  | { kind: "not_joined"; expired: boolean; full: boolean; creatorName: string | null }
  | JoinedChallengeState;

export async function getChallengeState(db: D1Database, userId: string, id: string): Promise<ChallengeStateResult> {
  const row = await loadChallenge(db, id);
  if (!row) return { kind: "not_found" };

  const isCreator = row.creator_user_id === userId;
  const isOpponent = row.opponent_user_id === userId;
  if (!isCreator && !isOpponent) {
    return { kind: "not_joined", expired: isExpired(row), full: row.opponent_user_id != null, creatorName: row.creator_name };
  }

  const opponentId = isCreator ? row.opponent_user_id : row.creator_user_id;
  let customAvatar: string | null = null;
  if (opponentId) {
    const r = await db.prepare(`SELECT avatar_url FROM quiz_users WHERE id = ?`).bind(opponentId).first<{ avatar_url: string | null }>();
    customAvatar = r?.avatar_url ?? null;
  }

  const round1 = {
    categoryLabel: categoryLabel(row.round1_category_key) ?? row.round1_category_key,
    me: isCreator
      ? { completed: row.round1_creator_completed_at != null, correct: row.round1_creator_correct, total: row.round1_creator_total, score: row.round1_creator_score }
      : { completed: row.round1_opponent_completed_at != null, correct: row.round1_opponent_correct, total: row.round1_opponent_total, score: row.round1_opponent_score },
    opponent: isCreator
      ? { completed: row.round1_opponent_completed_at != null, correct: row.round1_opponent_correct, total: row.round1_opponent_total, score: row.round1_opponent_score }
      : { completed: row.round1_creator_completed_at != null, correct: row.round1_creator_correct, total: row.round1_creator_total, score: row.round1_creator_score },
  };

  const round2 = row.round2_question_ids
    ? {
        categoryLabel: categoryLabel(row.round2_category_key) ?? row.round2_category_key ?? "",
        me: isCreator
          ? { completed: row.round2_creator_completed_at != null, correct: row.round2_creator_correct, total: row.round2_creator_total, score: row.round2_creator_score }
          : { completed: row.round2_opponent_completed_at != null, correct: row.round2_opponent_correct, total: row.round2_opponent_total, score: row.round2_opponent_score },
        opponent: isCreator
          ? { completed: row.round2_opponent_completed_at != null, correct: row.round2_opponent_correct, total: row.round2_opponent_total, score: row.round2_opponent_score }
          : { completed: row.round2_creator_completed_at != null, correct: row.round2_creator_correct, total: row.round2_creator_total, score: row.round2_creator_score },
      }
    : null;

  return {
    kind: "joined",
    id: row.id,
    isCreator,
    expiresAt: row.expires_at,
    opponentName: isCreator ? row.opponent_name : row.creator_name,
    opponentAvatar: customAvatar ?? (isCreator ? row.opponent_platform_avatar : row.creator_platform_avatar),
    round1,
    round2,
  };
}

export interface ChallengeSummary {
  id: string;
  isCreator: boolean;
  opponentName: string | null;
  waitingOnMe: boolean;
  done: boolean;
  expired: boolean;
  createdAt: string;
}

export async function getMyChallenges(db: D1Database, userId: string): Promise<ChallengeSummary[]> {
  const rows = await db
    .prepare(
      `SELECT * FROM quiz_challenges WHERE creator_user_id = ? OR opponent_user_id = ? ORDER BY created_at DESC LIMIT 30`,
    )
    .bind(userId, userId)
    .all<ChallengeRow>();

  return (rows.results ?? []).map((r) => {
    const isCreator = r.creator_user_id === userId;
    const done = isCreator ? r.round2_creator_completed_at != null : r.round2_opponent_completed_at != null;
    // "waiting on me" = it's my move: either I haven't played round1 yet
    // (opponent, pre-join case doesn't reach here), or round2 exists and I
    // haven't played it, or round1 is done both sides but I haven't started
    // round2 yet (opponent only).
    let waitingOnMe = false;
    if (isCreator) {
      waitingOnMe = r.round2_question_ids != null && r.round2_creator_completed_at == null;
    } else {
      waitingOnMe = r.round1_opponent_completed_at == null || (r.round1_opponent_completed_at != null && r.round2_question_ids == null);
    }
    return {
      id: r.id,
      isCreator,
      opponentName: isCreator ? r.opponent_name : r.creator_name,
      waitingOnMe,
      done,
      expired: isExpired(r),
      createdAt: r.created_at,
    };
  });
}
