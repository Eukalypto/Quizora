import type { D1Database } from "@cloudflare/workers-types";
import { getQuestionBank } from "@/lib/question-bank";
import type { Difficulty, Question } from "@/lib/categories";
import { levelToDifficulty } from "@/lib/categories";
import { evaluateBadges } from "./badges";
import { getOrGenerateMysteryPoolQuestion, pickSharedMysteryQuestion, type MysteryPoolQuestion } from "./mystery-pool.server";
import { pickWeighted } from "./ratio-sampling";
import { getLevel, getXpInLevel, nextStreak, normalizedScore, todayIso, isoWeek, xpForGame } from "./scoring";
import { AI_QUESTION_COUNT, buildDailySet, buildWeeklySet, topLevelTagsForQuestions, WEEKLY_SET_SIZE } from "./session";
import type {
  HistoryEntry,
  SubmitGameResultInput,
  SubmitGameResultOutput,
  UserSnapshot,
  WeeklyHistoryEntry,
} from "./types";

// Synthetic ids for AI-generated Daily/Weekly questions — offset well clear
// of every real question id (11k-ish today) so they never collide with
// ALL_QUESTIONS, while staying a plain `number` like every other Question id.
const AI_QUESTION_ID_OFFSET = 1_000_000;

function randomLevel(): 1 | 2 | 3 {
  return (Math.floor(Math.random() * 3) + 1) as 1 | 2 | 3;
}

function aiQuestionToQuestion(ai: MysteryPoolQuestion): Question {
  return {
    id: AI_QUESTION_ID_OFFSET + ai.poolId,
    subcategories: ["ai-generated"],
    level: ai.level,
    question: "What is this?",
    answers: ai.options as [string, string, string, string],
    correct: ai.correctIndex as 0 | 1 | 2 | 3,
    media_url: ai.mediaUrl,
  };
}

// Multiplayer is pass-and-play on one device/account, so "no repeat" there
// is a rolling window rather than the solo modes' permanent exclusion —
// after 24h a question can resurface. Solo modes never expire the exclusion.
const MULTIPLAYER_SEEN_WINDOW_MS = 24 * 60 * 60 * 1000;
const FREEPLAY_SET_SIZE = 10;

interface UserRow {
  id: string;
  avatar_url: string | null;
  xp: number;
  streak: number;
  games_played: number;
  daily_done: string | null;
  weekly_done: string | null;
  weekly_score: number;
  weekly_perfect_bonus: number;
}

/** Saves the result of the in-app AI avatar creator — separate from the
 * Higgsfield platform account's own avatar (CurrentUser.avatar_url). */
export async function setAvatarUrl(db: D1Database, userId: string, avatarUrl: string): Promise<void> {
  await ensureUser(db, userId);
  await db.prepare(`UPDATE quiz_users SET avatar_url = ?, updated_at = datetime('now') WHERE id = ?`).bind(avatarUrl, userId).run();
}

async function ensureUser(db: D1Database, userId: string): Promise<void> {
  await db.prepare(`INSERT OR IGNORE INTO quiz_users (id) VALUES (?)`).bind(userId).run();
}

async function loadSnapshot(db: D1Database, userId: string): Promise<UserSnapshot> {
  const userRow = await db
    .prepare(`SELECT * FROM quiz_users WHERE id = ?`)
    .bind(userId)
    .first<UserRow>();
  if (!userRow) throw new Error("User row missing after ensureUser");

  const historyRows = await db
    .prepare(
      `SELECT id, played_at, mode, category_label, correct, total, score, perfect, perfect_bonus
       FROM quiz_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 60`,
    )
    .bind(userId)
    .all<{
      id: number;
      played_at: string;
      mode: string;
      category_label: string | null;
      correct: number;
      total: number;
      score: number;
      perfect: number;
      perfect_bonus: number;
    }>();

  const weeklyRows = await db
    .prepare(
      `SELECT id, week, played_at, score, perfect, perfect_bonus
       FROM quiz_weekly_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 8`,
    )
    .bind(userId)
    .all<{
      id: number;
      week: string;
      played_at: string;
      score: number;
      perfect: number;
      perfect_bonus: number;
    }>();

  const categoryRows = await db
    .prepare(`SELECT top_level_tag, play_count FROM quiz_category_plays WHERE user_id = ?`)
    .bind(userId)
    .all<{ top_level_tag: string; play_count: number }>();

  const badgeRows = await db
    .prepare(`SELECT badge_id FROM quiz_badges_seen WHERE user_id = ?`)
    .bind(userId)
    .all<{ badge_id: string }>();

  const history: HistoryEntry[] = (historyRows.results ?? []).map((r) => ({
    id: r.id,
    playedAt: r.played_at,
    mode: r.mode as HistoryEntry["mode"],
    categoryLabel: r.category_label,
    correct: r.correct,
    total: r.total,
    score: r.score,
    perfect: r.perfect === 1,
    perfectBonus: r.perfect_bonus,
  }));

  const weeklyHistory: WeeklyHistoryEntry[] = (weeklyRows.results ?? []).map((r) => ({
    id: r.id,
    week: r.week,
    playedAt: r.played_at,
    score: r.score,
    perfect: r.perfect === 1,
    perfectBonus: r.perfect_bonus,
  }));

  const categoryPlays: Record<string, number> = {};
  for (const r of categoryRows.results ?? []) categoryPlays[r.top_level_tag] = r.play_count;

  const seenBadgeIds = (badgeRows.results ?? []).map((r) => r.badge_id);

  const unlockedBadgeIds = evaluateBadges({
    xp: userRow.xp,
    streak: userRow.streak,
    gamesPlayed: userRow.games_played,
    weeklyDone: userRow.weekly_done,
    history,
    weeklyHistory,
    categoryPlays,
  });

  return {
    id: userRow.id,
    avatarUrl: userRow.avatar_url,
    xp: userRow.xp,
    level: getLevel(userRow.xp),
    xpInLevel: getXpInLevel(userRow.xp),
    streak: userRow.streak,
    gamesPlayed: userRow.games_played,
    dailyDone: userRow.daily_done,
    weeklyDone: userRow.weekly_done,
    weeklyScore: userRow.weekly_score,
    weeklyPerfectBonus: userRow.weekly_perfect_bonus,
    history,
    weeklyHistory,
    categoryPlays,
    unlockedBadgeIds,
    seenBadgeIds,
  };
}

export async function getUserSnapshot(db: D1Database, userId: string): Promise<UserSnapshot> {
  await ensureUser(db, userId);
  return loadSnapshot(db, userId);
}

async function getSeenQuestionIds(db: D1Database, userId: string): Promise<Set<number>> {
  const seenRows = await db
    .prepare(`SELECT question_id FROM quiz_seen_questions WHERE user_id = ?`)
    .bind(userId)
    .all<{ question_id: number }>();
  return new Set((seenRows.results ?? []).map((r) => r.question_id));
}

async function markQuestionsSeen(db: D1Database, userId: string, questionIds: number[]): Promise<void> {
  const distinctIds = [...new Set(questionIds)];
  if (distinctIds.length === 0) return;
  const upserts = distinctIds.map((id) =>
    db
      .prepare(
        `INSERT INTO quiz_seen_questions (user_id, question_id, seen_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT (user_id, question_id) DO UPDATE SET seen_at = excluded.seen_at`,
      )
      .bind(userId, id),
  );
  await db.batch(upserts);
}

/** Free play question set: never repeats a question this user has already
 * seen (any solo mode — daily/weekly/freeplay all share this history),
 * recycling the whole pool only once every eligible question has been seen.
 * Keyed by the question's stable id, not array index — safe against sheet
 * reordering/edits. */
export async function buildFreePlaySetForUser(
  db: D1Database,
  userId: string,
  categoryTags: string[],
  level: 1 | 2 | 3,
): Promise<Question[]> {
  await ensureUser(db, userId);

  const { questions: ALL_QUESTIONS, combinedCategories: COMBINED_CATEGORY_RATIOS } = await getQuestionBank();
  const pool = ALL_QUESTIONS.filter(
    (q) => q.level === level && categoryTags.every((tag) => q.subcategories.includes(tag)),
  );
  if (pool.length === 0) return [];

  const seenIds = await getSeenQuestionIds(db, userId);
  const available = pool.filter((q) => !seenIds.has(q.id));

  const source = available.length > 0 ? available : pool;
  // Ratio-weighted sampling only applies when the player picked a single
  // combined top-level category (e.g. "History") — a more specific pick
  // (e.g. "History of Europe") is already a single component, nothing to
  // weight.
  const components = categoryTags.length === 1 ? (COMBINED_CATEGORY_RATIOS[categoryTags[0]] ?? null) : null;
  const selected = pickWeighted(source, components, FREEPLAY_SET_SIZE, new Set());

  await markQuestionsSeen(db, userId, selected.map((q) => q.id));

  return selected;
}

interface StoredAiRow {
  question_index: number;
  pool_id: number;
  subject_id: string;
  media_url: string;
  level: number;
  options_json: string;
  correct_index: number;
}

function storedAiRowToQuestion(r: StoredAiRow): Question {
  return {
    id: AI_QUESTION_ID_OFFSET + r.pool_id,
    subcategories: ["ai-generated"],
    level: r.level as 1 | 2 | 3,
    question: "What is this?",
    answers: JSON.parse(r.options_json) as [string, string, string, string],
    correct: r.correct_index as 0 | 1 | 2 | 3,
    media_url: r.media_url,
  };
}

/** Weekly's 2 AI questions are generated once per week and persisted, so
 * every player that week — not just the first one to trigger the build —
 * sees the exact same pair (same images, same shuffled option order). */
async function getOrBuildWeeklyAiQuestions(db: D1Database, week: string): Promise<Question[]> {
  const existing = await db
    .prepare(`SELECT question_index, pool_id, subject_id, media_url, level, options_json, correct_index FROM quiz_weekly_ai_questions WHERE week = ? ORDER BY question_index`)
    .bind(week)
    .all<StoredAiRow>();
  if ((existing.results?.length ?? 0) >= AI_QUESTION_COUNT) {
    return existing.results!.map((r) => storedAiRowToQuestion(r));
  }

  const usedRows = await db.prepare(`SELECT subject_id FROM quiz_weekly_used_mystery_subjects`).all<{ subject_id: string }>();
  const usedSubjectIds = new Set((usedRows.results ?? []).map((r) => r.subject_id));

  const picked: MysteryPoolQuestion[] = [];
  for (let i = 0; i < AI_QUESTION_COUNT; i++) {
    const exclude = [...usedSubjectIds, ...picked.map((p) => p.subjectId)];
    const question = await pickSharedMysteryQuestion(db, randomLevel(), exclude);
    if (question) picked.push(question);
  }
  if (picked.length === 0) return [];

  await db.batch([
    ...picked.map((p, i) =>
      db
        .prepare(
          `INSERT OR IGNORE INTO quiz_weekly_ai_questions (week, question_index, pool_id, subject_id, media_url, level, options_json, correct_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(week, i, p.poolId, p.subjectId, p.mediaUrl, p.level, JSON.stringify(p.options), p.correctIndex),
    ),
    ...picked.map((p) =>
      db.prepare(`INSERT OR IGNORE INTO quiz_weekly_used_mystery_subjects (subject_id, week) VALUES (?, ?)`).bind(p.subjectId, week),
    ),
  ]);

  return picked.map((p) => aiQuestionToQuestion(p));
}

/** Daily challenge: same permanent per-user no-repeat as free play, sharing
 * the same seen-history so a question already served via any solo mode
 * never resurfaces for this user again (until the whole bank is exhausted,
 * which — at 11k+ questions and 10/day — is not a practical concern).
 * 12 questions total: 10 from the JSON pool + 2 AI-generated. Always builds
 * this week's shared Weekly set first (idempotent — a no-op if it already
 * exists) and excludes whatever Weekly used, so Daily never repeats a
 * question or AI subject that already appeared in this week's Weekly (#3). */
export async function buildDailySetForUser(db: D1Database, userId: string): Promise<Question[]> {
  await ensureUser(db, userId);
  const week = isoWeek();
  const weeklySet = await buildWeeklySetShared(db, week);
  const weeklyIds = new Set(weeklySet.map((q) => q.id));
  const weeklySubjectRows = await db.prepare(`SELECT subject_id FROM quiz_weekly_used_mystery_subjects WHERE week = ?`).bind(week).all<{ subject_id: string }>();
  const weeklySubjectIds = (weeklySubjectRows.results ?? []).map((r) => r.subject_id);

  const seenIds = await getSeenQuestionIds(db, userId);
  const excludeIds = new Set([...seenIds, ...weeklyIds]);
  const jsonQuestions = await buildDailySet(excludeIds);
  await markQuestionsSeen(db, userId, jsonQuestions.map((q) => q.id));

  const aiPicks: Question[] = [];
  const aiPickedSubjectIds: string[] = [];
  for (let i = 0; i < AI_QUESTION_COUNT; i++) {
    const exclude = [...weeklySubjectIds, ...aiPickedSubjectIds];
    const picked = await getOrGenerateMysteryPoolQuestion(db, userId, randomLevel(), exclude);
    if (picked) {
      aiPicks.push(aiQuestionToQuestion(picked));
      aiPickedSubjectIds.push(picked.subjectId);
    }
  }

  return [...jsonQuestions, ...aiPicks];
}

/** Weekly challenge: deliberately NOT per-user — every player sees the same
 * set within a given week, so weekly scores stay comparable. No-repeat is
 * enforced globally instead: once a question has appeared in any past
 * week's set, it's excluded from all future weeks. 12 questions total: 10
 * from the JSON pool + 2 AI-generated, both parts idempotent per week (see
 * getOrBuildWeeklyAiQuestions) so repeat calls in the same week — e.g. a
 * second player starting Weekly — return the identical set, not a re-roll. */
export async function buildWeeklySetShared(db: D1Database, week: string = isoWeek()): Promise<Question[]> {
  const thisWeekRows = await db.prepare(`SELECT question_id FROM quiz_weekly_used_questions WHERE week = ?`).bind(week).all<{ question_id: number }>();
  const thisWeekIds = (thisWeekRows.results ?? []).map((r) => r.question_id);

  let jsonQuestions: Question[];
  if (thisWeekIds.length >= WEEKLY_SET_SIZE) {
    // Already built this week — re-fetch the exact same questions rather
    // than re-deriving (re-deriving with a mutated exclude set would not
    // reproduce the same set; see the comment on the prior single-query
    // version of this function this replaced).
    const idSet = new Set(thisWeekIds);
    const { questions: ALL_QUESTIONS } = await getQuestionBank();
    jsonQuestions = ALL_QUESTIONS.filter((q) => idSet.has(q.id));
  } else {
    const usedRows = await db.prepare(`SELECT question_id FROM quiz_weekly_used_questions`).all<{ question_id: number }>();
    const usedIds = new Set((usedRows.results ?? []).map((r) => r.question_id));
    jsonQuestions = await buildWeeklySet(week, usedIds);
    const inserts = jsonQuestions.map((q) =>
      db.prepare(`INSERT OR IGNORE INTO quiz_weekly_used_questions (question_id, week) VALUES (?, ?)`).bind(q.id, week),
    );
    if (inserts.length > 0) await db.batch(inserts);
  }

  const aiQuestions = await getOrBuildWeeklyAiQuestions(db, week);
  return [...jsonQuestions, ...aiQuestions];
}

/** Local pass-and-play question selection for one multiplayer team — a
 * rolling 24h no-repeat window per user (not permanent like solo, since a
 * shared device/local match doesn't warrant the same long memory) drawn
 * from the same quiz_seen_questions history. */
export async function pickMultiplayerQuestionsForUser(
  db: D1Database,
  userId: string,
  categoryTagGroups: string[][],
  difficulty: Difficulty,
  count: number,
): Promise<Question[]> {
  await ensureUser(db, userId);

  const { questions: ALL_QUESTIONS, combinedCategories: COMBINED_CATEGORY_RATIOS } = await getQuestionBank();
  const seenRows = await db
    .prepare(`SELECT question_id, seen_at FROM quiz_seen_questions WHERE user_id = ?`)
    .bind(userId)
    .all<{ question_id: number; seen_at: string }>();
  const seenAt = new Map((seenRows.results ?? []).map((r) => [r.question_id, Date.parse(r.seen_at)]));
  const now = Date.now();
  const notStale = (q: Question) => {
    const seenTime = seenAt.get(q.id);
    return seenTime === undefined || now - seenTime >= MULTIPLAYER_SEEN_WINDOW_MS;
  };

  // Split `count` evenly across every selected category (rather than one
  // flat OR-pool) so ratio weighting — which only makes sense per category —
  // has something to apply to, and so multiple picked categories each get
  // fair representation instead of whichever has the most raw questions
  // dominating a shared draw.
  const base = Math.floor(count / categoryTagGroups.length);
  const extra = count % categoryTagGroups.length;
  const usedIds = new Set<number>();
  const picked: Question[] = [];

  categoryTagGroups.forEach((tags, i) => {
    const want = base + (i < extra ? 1 : 0);
    if (want === 0) return;
    const categoryPool = ALL_QUESTIONS.filter(
      (q) => levelToDifficulty(q.level) === difficulty && tags.every((t) => q.subcategories.includes(t)),
    );
    const available = categoryPool.filter((q) => notStale(q));
    const source = available.length >= want ? available : categoryPool;
    const components = tags.length === 1 ? (COMBINED_CATEGORY_RATIOS[tags[0]] ?? null) : null;
    const got = pickWeighted(source, components, want, usedIds);
    got.forEach((q) => usedIds.add(q.id));
    picked.push(...got);
  });

  // Some category's own pool ran dry — backfill from the full OR-union pool
  // (today's original fallback) so the round still has `count` questions
  // whenever the bank overall supports it.
  if (picked.length < count) {
    const orPool = ALL_QUESTIONS.filter(
      (q) =>
        levelToDifficulty(q.level) === difficulty &&
        categoryTagGroups.some((tags) => tags.every((t) => q.subcategories.includes(t))) &&
        !usedIds.has(q.id),
    );
    const backfill = [...orPool].sort(() => Math.random() - 0.5).slice(0, count - picked.length);
    backfill.forEach((q) => usedIds.add(q.id));
    picked.push(...backfill);
  }

  // Whole bank for these categories/difficulty is smaller than `count` —
  // repeat, same as before, rather than returning a short set.
  const set: Question[] = [];
  if (picked.length === 0) return set;
  for (let i = 0; i < count; i++) set.push(picked[i % picked.length]);

  await markQuestionsSeen(db, userId, set.map((q) => q.id));

  return set;
}

export async function submitGameResult(
  db: D1Database,
  userId: string,
  input: SubmitGameResultInput,
): Promise<SubmitGameResultOutput> {
  await ensureUser(db, userId);
  const userRow = await db.prepare(`SELECT * FROM quiz_users WHERE id = ?`).bind(userId).first<UserRow>();
  if (!userRow) throw new Error("User row missing after ensureUser");

  const today = todayIso();
  const thisWeek = isoWeek();
  const isPerfect = input.total > 0 && input.correct === input.total;
  const perfectBonus = isPerfect ? 20 : 0;

  if (input.mode === "daily" && userRow.daily_done === today) {
    return { xpEarned: 0, snapshot: await loadSnapshot(db, userId), newlyUnlockedBadgeIds: [], rejected: "daily-already-done" };
  }
  if (input.mode === "weekly" && userRow.weekly_done === thisWeek) {
    return { xpEarned: 0, snapshot: await loadSnapshot(db, userId), newlyUnlockedBadgeIds: [], rejected: "weekly-already-done" };
  }

  const xpEarned = xpForGame(input.mode, input.correct);
  const statements = [];

  if (input.mode === "daily") {
    const streak = nextStreak(userRow.streak, userRow.daily_done, today);
    statements.push(
      db
        .prepare(
          `UPDATE quiz_users SET xp = xp + ?, games_played = games_played + 1, streak = ?, daily_done = ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(xpEarned, streak, today, userId),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO quiz_history (user_id, mode, category_label, correct, total, score, perfect, perfect_bonus)
           VALUES (?, 'daily', NULL, ?, ?, ?, ?, ?)`,
        )
        .bind(userId, input.correct, input.total, normalizedScore(input.correct, input.total), isPerfect ? 1 : 0, perfectBonus),
    );
  } else if (input.mode === "weekly") {
    const weeklyScore = input.correct * 10 + perfectBonus;
    statements.push(
      db
        .prepare(
          `UPDATE quiz_users SET xp = xp + ?, games_played = games_played + 1, weekly_done = ?, weekly_score = weekly_score + ?, weekly_perfect_bonus = weekly_perfect_bonus + ?, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(xpEarned, thisWeek, weeklyScore, perfectBonus, userId),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO quiz_weekly_history (user_id, week, score, perfect, perfect_bonus) VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(userId, thisWeek, weeklyScore, isPerfect ? 1 : 0, perfectBonus),
    );
  } else {
    const points = input.correct * 10 + (input.timeBonusTotal ?? 0);
    statements.push(
      db
        .prepare(
          `UPDATE quiz_users SET xp = xp + ?, games_played = games_played + 1, updated_at = datetime('now') WHERE id = ?`,
        )
        .bind(xpEarned, userId),
    );
    statements.push(
      db
        .prepare(
          `INSERT INTO quiz_history (user_id, mode, category_label, correct, total, score, perfect, perfect_bonus)
           VALUES (?, 'freeplay', ?, ?, ?, ?, 0, 0)`,
        )
        .bind(userId, input.categoryLabel ?? null, input.correct, input.total, points),
    );
  }

  const playedTags = await topLevelTagsForQuestions(input.questionIds);
  for (const tag of playedTags) {
    statements.push(
      db
        .prepare(
          `INSERT INTO quiz_category_plays (user_id, top_level_tag, play_count) VALUES (?, ?, 1)
           ON CONFLICT (user_id, top_level_tag) DO UPDATE SET play_count = play_count + 1`,
        )
        .bind(userId, tag),
    );
  }

  await db.batch(statements);

  // A badge is "new" iff it now evaluates true and hasn't been shown before
  // (quiz_badges_seen) — no need to diff against a pre-update snapshot.
  const snapshot = await loadSnapshot(db, userId);
  const newlyUnlockedBadgeIds = snapshot.unlockedBadgeIds.filter(
    (id) => !snapshot.seenBadgeIds.includes(id),
  );

  if (newlyUnlockedBadgeIds.length > 0) {
    await db.batch(
      newlyUnlockedBadgeIds.map((badgeId) =>
        db
          .prepare(`INSERT OR IGNORE INTO quiz_badges_seen (user_id, badge_id) VALUES (?, ?)`)
          .bind(userId, badgeId),
      ),
    );
  }

  return { xpEarned, snapshot, newlyUnlockedBadgeIds };
}
