import type { D1Database } from "@cloudflare/workers-types";
import { createJobClient } from "@higgsfield/fnf/client";
import { nanoBanana2 } from "@higgsfield/fnf/jobs";
import { createWorkflowPlatformAdapter } from "@higgsfield/fnf/workflow-platform";
import {
  buildMysteryPrompt,
  MYSTERY_SUBJECTS,
  pickMysterySubject,
  shuffleOptions,
  type MysteryCategory,
  type MysterySubject,
} from "./mystery";

// Shared by the Mystery Round game mode AND Daily/Weekly's 2 AI-generated
// questions (#14) — both draw from the same cross-user-reusable image bank
// (quiz_mystery_pool/quiz_mystery_seen) so a fresh generation for one player
// or one game mode becomes free reuse for every other player/mode that
// hasn't seen that specific image yet. Mystery Round's own per-day play cap
// (quiz_mystery_daily) is NOT touched here — that budget stays specific to
// the Mystery Round game mode; see mystery.functions.ts.

function buildAdapter() {
  return createWorkflowPlatformAdapter({ baseUrl: "https://fnf.internal", confirm: async () => {} });
}

export async function generateOneMysteryImage(
  level: 1 | 2 | 3,
  excludeIds: string[],
): Promise<{ subject: MysterySubject; mediaUrl: string } | null> {
  const subject = pickMysterySubject(level, excludeIds);
  const adapter = buildAdapter();
  const jobs = createJobClient({ adapter, jobs: [nanoBanana2] });
  const result = await jobs.safeSubmit({
    model: "nano_banana_2",
    prompt: { instruction: buildMysteryPrompt(subject) },
    settings: { aspectRatio: "1:1", batchSize: 1 },
  });
  if (!result.ok) return null;
  const [done] = await jobs.wait(result.generations, { onProgress: () => {} });
  const mediaUrl = done.results?.rawUrl;
  if (!mediaUrl) return null;
  return { subject, mediaUrl };
}

export interface MysteryPoolQuestion {
  poolId: number;
  subjectId: string;
  level: 1 | 2 | 3;
  category: MysteryCategory;
  mediaUrl: string;
  options: string[];
  correctIndex: number;
}

/** Serves one AI-generated "guess the image" question to `userId` at
 * `level`, reusing an image this user hasn't seen yet (from any source —
 * Mystery Round or another mode's Daily), generating fresh only when the
 * shared pool has nothing unseen left for them. */
export async function getOrGenerateMysteryPoolQuestion(
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
       ORDER BY p.created_at ASC LIMIT 1`,
    )
    .bind(userId, level, ...excludeSubjects)
    .first<{ id: number; subject_id: string; media_url: string }>();

  if (!poolRow) {
    poolRow = await db
      .prepare(
        `SELECT p.id, p.subject_id, p.media_url FROM quiz_mystery_pool p
         LEFT JOIN quiz_mystery_seen s ON s.pool_id = p.id AND s.user_id = ?
         WHERE p.level = ? AND s.pool_id IS NULL
         ORDER BY p.created_at ASC LIMIT 1`,
      )
      .bind(userId, level)
      .first<{ id: number; subject_id: string; media_url: string }>();
  }

  if (poolRow) {
    const subject = MYSTERY_SUBJECTS.find((s) => s.id === poolRow.subject_id);
    if (subject) {
      await db.prepare(`INSERT INTO quiz_mystery_seen (user_id, pool_id) VALUES (?, ?) ON CONFLICT DO NOTHING`).bind(userId, poolRow.id).run();
      await db
        .prepare(`UPDATE quiz_mystery_pool SET status = 'used', used_by_user_id = COALESCE(used_by_user_id, ?) WHERE id = ?`)
        .bind(userId, poolRow.id)
        .run();
      const { options, correctIndex } = shuffleOptions(subject);
      return { poolId: poolRow.id, subjectId: subject.id, level: subject.level, category: subject.category, mediaUrl: poolRow.media_url, options, correctIndex };
    }
  }

  const generated = await generateOneMysteryImage(level, excludeSubjects);
  if (!generated) return null;
  const insertResult = await db
    .prepare(`INSERT INTO quiz_mystery_pool (level, subject_id, media_url, status, used_by_user_id) VALUES (?, ?, ?, 'used', ?)`)
    .bind(generated.subject.level, generated.subject.id, generated.mediaUrl, userId)
    .run();
  const newPoolId = insertResult.meta.last_row_id as number;
  await db.prepare(`INSERT INTO quiz_mystery_seen (user_id, pool_id) VALUES (?, ?)`).bind(userId, newPoolId).run();
  const { options, correctIndex } = shuffleOptions(generated.subject);
  return {
    poolId: newPoolId,
    subjectId: generated.subject.id,
    level: generated.subject.level,
    category: generated.subject.category,
    mediaUrl: generated.mediaUrl,
    options,
    correctIndex,
  };
}

/** Weekly's 2 AI questions are shared, not per-user — this doesn't mark
 * anything "seen" for a specific user (there isn't one at set-creation
 * time). It only avoids repeating a subject that's already appeared in a
 * past week's shared set, reusing any existing pool image for that subject
 * (free) before generating a new one. Callers persist the result themselves
 * (see quiz_weekly_ai_questions) so every player that week gets the exact
 * same pair. */
export async function pickSharedMysteryQuestion(
  db: D1Database,
  level: 1 | 2 | 3,
  excludeSubjectIds: string[],
): Promise<MysteryPoolQuestion | null> {
  const clause = excludeSubjectIds.length > 0 ? `AND subject_id NOT IN (${excludeSubjectIds.map(() => "?").join(",")})` : "";
  const row = await db
    .prepare(`SELECT id, subject_id, media_url FROM quiz_mystery_pool WHERE level = ? ${clause} ORDER BY created_at ASC LIMIT 1`)
    .bind(level, ...excludeSubjectIds)
    .first<{ id: number; subject_id: string; media_url: string }>();

  if (row) {
    const subject = MYSTERY_SUBJECTS.find((s) => s.id === row.subject_id);
    if (subject) {
      const { options, correctIndex } = shuffleOptions(subject);
      return { poolId: row.id, subjectId: subject.id, level: subject.level, category: subject.category, mediaUrl: row.media_url, options, correctIndex };
    }
  }

  const generated = await generateOneMysteryImage(level, excludeSubjectIds);
  if (!generated) return null;
  const insertResult = await db
    .prepare(`INSERT INTO quiz_mystery_pool (level, subject_id, media_url, status) VALUES (?, ?, ?, 'ready')`)
    .bind(level, generated.subject.id, generated.mediaUrl)
    .run();
  const { options, correctIndex } = shuffleOptions(generated.subject);
  return {
    poolId: insertResult.meta.last_row_id as number,
    subjectId: generated.subject.id,
    level: generated.subject.level,
    category: generated.subject.category,
    mediaUrl: generated.mediaUrl,
    options,
    correctIndex,
  };
}
