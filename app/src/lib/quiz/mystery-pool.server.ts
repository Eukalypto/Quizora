import type { D1Database } from "@cloudflare/workers-types";
import { MYSTERY_SUBJECTS, shuffleOptions, type MysteryCategory } from "./mystery";

// Shared by the Mystery Round game mode AND Daily/Weekly's 2 "guess the
// image" questions — both draw from the same quiz_mystery_pool of curated
// images (synced from R2, see mystery-sync.server.ts), so an image curated
// once is reusable across every player/mode that hasn't seen it yet. Mystery
// Round's own per-day play cap (quiz_mystery_daily) is NOT touched here —
// that budget stays specific to the Mystery Round game mode; see
// mystery.functions.ts.

export interface MysteryPoolQuestion {
  poolId: number;
  subjectId: string;
  level: 1 | 2 | 3;
  category: MysteryCategory;
  mediaUrl: string;
  options: string[];
  correctIndex: number;
}

function toQuestion(row: { id: number; subject_id: string; media_url: string }, level: 1 | 2 | 3): MysteryPoolQuestion | null {
  const subject = MYSTERY_SUBJECTS.find((s) => s.id === row.subject_id);
  if (!subject) return null;
  const { options, correctIndex } = shuffleOptions(subject);
  return { poolId: row.id, subjectId: subject.id, level, category: subject.category, mediaUrl: row.media_url, options, correctIndex };
}

/** Serves one curated "guess the image" question to `userId` at `level`,
 * reusing an image this user hasn't seen yet (from any source — Mystery
 * Round or another mode's Daily). Returns null when nothing curated is left
 * unseen for them at that level — there's no generation fallback; the pool is
 * exactly what's been uploaded to R2 and synced (see mystery-sync.server.ts). */
export async function getMysteryPoolQuestion(
  db: D1Database,
  userId: string,
  level: 1 | 2 | 3,
  excludeSubjectIds: string[] = [],
): Promise<MysteryPoolQuestion | null> {
  const priorSubjectRows = await db
    .prepare(
      `SELECT DISTINCT p.subject_id FROM quiz_mystery_seen s
       JOIN quiz_mystery_pool p ON p.id = s.pool_id
       WHERE s.user_id = ? AND p.level = ?`,
    )
    .bind(userId, level)
    .all<{ subject_id: string }>();
  const excludeSubjects = [...new Set([...excludeSubjectIds, ...(priorSubjectRows.results ?? []).map((r) => r.subject_id)])];

  const subjectExcludeClause = excludeSubjects.length > 0 ? `AND p.subject_id NOT IN (${excludeSubjects.map(() => "?").join(",")})` : "";
  let poolRow = await db
    .prepare(
      `SELECT p.id, p.subject_id, p.media_url FROM quiz_mystery_pool p
       LEFT JOIN quiz_mystery_seen s ON s.pool_id = p.id AND s.user_id = ?
       WHERE p.level = ? AND s.pool_id IS NULL ${subjectExcludeClause}
       ORDER BY RANDOM() LIMIT 1`,
    )
    .bind(userId, level, ...excludeSubjects)
    .first<{ id: number; subject_id: string; media_url: string }>();

  if (!poolRow) {
    // Every subject at this level has been seen by this user — recycle,
    // ignoring the subject exclusion (still honoring "not already seen").
    poolRow = await db
      .prepare(
        `SELECT p.id, p.subject_id, p.media_url FROM quiz_mystery_pool p
         LEFT JOIN quiz_mystery_seen s ON s.pool_id = p.id AND s.user_id = ?
         WHERE p.level = ? AND s.pool_id IS NULL
         ORDER BY RANDOM() LIMIT 1`,
      )
      .bind(userId, level)
      .first<{ id: number; subject_id: string; media_url: string }>();
  }

  if (!poolRow) return null;

  const question = toQuestion(poolRow, level);
  if (!question) return null;
  await db.prepare(`INSERT INTO quiz_mystery_seen (user_id, pool_id) VALUES (?, ?) ON CONFLICT DO NOTHING`).bind(userId, poolRow.id).run();
  return question;
}

/** Weekly's 2 questions are shared, not per-user — this doesn't mark
 * anything "seen" for a specific user (there isn't one at set-creation
 * time). It only avoids repeating a subject that's already appeared in a
 * past week's shared set. Callers persist the result themselves (see
 * quiz_weekly_ai_questions) so every player that week gets the exact same
 * pair. Returns null when nothing curated is available at that level. */
export async function pickSharedMysteryQuestion(
  db: D1Database,
  level: 1 | 2 | 3,
  excludeSubjectIds: string[],
): Promise<MysteryPoolQuestion | null> {
  const clause = excludeSubjectIds.length > 0 ? `AND subject_id NOT IN (${excludeSubjectIds.map(() => "?").join(",")})` : "";
  const row = await db
    .prepare(`SELECT id, subject_id, media_url FROM quiz_mystery_pool WHERE level = ? ${clause} ORDER BY RANDOM() LIMIT 1`)
    .bind(level, ...excludeSubjectIds)
    .first<{ id: number; subject_id: string; media_url: string }>();
  if (!row) return null;
  return toQuestion(row, level);
}
