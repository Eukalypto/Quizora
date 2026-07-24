import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { D1Database } from "@cloudflare/workers-types";
import { createJobClient } from "@higgsfield/fnf/client";
import { nanoBanana2 } from "@higgsfield/fnf/jobs";
import { createWorkflowPlatformAdapter } from "@higgsfield/fnf/workflow-platform";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import { MYSTERY_SUBJECTS } from "@/lib/quiz/mystery";
import { generateOneMysteryImage, getOrGenerateMysteryPoolQuestion } from "@/lib/quiz/mystery-pool.server";
import { todayIso } from "@/lib/quiz/scoring";

const DAILY_LIMIT = 7;
// Total shared images to keep per level (across every status, every user) —
// not just an initial warm-up buffer. Since any previously generated image
// is now reusable for any user who hasn't seen it, growing this over time is
// what actually saves credits on repeat plays; 24 (~4 per subject, 6 subjects
// per level) keeps a single very active player from exhausting the shared
// supply and hitting synchronous generation within a few days.
const POOL_TARGET = 24;
const levelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

// Standalone UI host pattern (same as elsewhere): the client shows one
// upfront cost-confirmation modal before the round starts, so every
// generation call in the round is pre-approved — this callback just resolves.
function buildAdapter() {
  return createWorkflowPlatformAdapter({ baseUrl: "https://fnf.internal", confirm: async () => {} });
}

async function incrementDailyCount(db: D1Database, userId: string, today: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO quiz_mystery_daily (user_id, play_date, count) VALUES (?, ?, 1)
       ON CONFLICT (user_id, play_date) DO UPDATE SET count = count + 1`,
    )
    .bind(userId, today)
    .run();
}

export const getMysteryQuestionCost = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new Error("unauthorized");

  const adapter = buildAdapter();
  const jobs = createJobClient({ adapter, jobs: [nanoBanana2] });
  const cost = await jobs.cost({
    model: "nano_banana_2",
    prompt: { instruction: "cost preview" },
    settings: { aspectRatio: "1:1", batchSize: 1 },
  });
  return { credits: cost.credits };
});

export const getMysteryDailyStatus = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new Error("unauthorized");
  const { DB } = bindings();
  if (!DB) throw new Error("D1 binding missing");

  const row = await DB.prepare(`SELECT count FROM quiz_mystery_daily WHERE user_id = ? AND play_date = ?`)
    .bind(auth.user.id, todayIso())
    .first<{ count: number }>();
  const used = row?.count ?? 0;
  return { used, remaining: Math.max(0, DAILY_LIMIT - used), limit: DAILY_LIMIT };
});

const generateInput = z.object({
  level: levelSchema,
  excludeIds: z.array(z.string()).default([]),
});

export const generateMysteryQuestion = createServerFn({ method: "POST" })
  .validator(generateInput)
  .handler(async ({ data }) => {
    const auth = await requireCurrentUser();
    if (!auth.ok) throw new Error("unauthorized");
    const { DB } = bindings();
    if (!DB) throw new Error("D1 binding missing");

    const today = todayIso();
    const dailyRow = await DB.prepare(`SELECT count FROM quiz_mystery_daily WHERE user_id = ? AND play_date = ?`)
      .bind(auth.user.id, today)
      .first<{ count: number }>();
    if ((dailyRow?.count ?? 0) >= DAILY_LIMIT) {
      return { ok: false as const, errorCode: "daily_limit_reached" as const };
    }

    const picked = await getOrGenerateMysteryPoolQuestion(DB, auth.user.id, data.level, data.excludeIds);
    if (!picked) {
      return { ok: false as const, errorCode: "job_failed" as const };
    }
    await incrementDailyCount(DB, auth.user.id, today);
    return {
      ok: true as const,
      subjectId: picked.subjectId,
      level: picked.level,
      category: picked.category,
      mediaUrl: picked.mediaUrl,
      options: picked.options,
      correctIndex: picked.correctIndex,
    };
  });

const replenishInput = z.object({ level: levelSchema });

/** Fire-and-forget from the client after every consumed question — keeps the
 * shared library (across ALL users, not just unused rows) topped up to
 * POOL_TARGET per level so reuse stays likely and fresh requests stay instant. */
export const replenishMysteryPool = createServerFn({ method: "POST" })
  .validator(replenishInput)
  .handler(async ({ data }) => {
    const auth = await requireCurrentUser();
    if (!auth.ok) return { ok: false as const };
    const { DB } = bindings();
    if (!DB) return { ok: false as const };

    const countRow = await DB.prepare(`SELECT COUNT(*) as c FROM quiz_mystery_pool WHERE level = ?`)
      .bind(data.level)
      .first<{ c: number }>();
    if ((countRow?.c ?? 0) >= POOL_TARGET) {
      return { ok: true as const, skipped: true };
    }

    const existingRows = await DB.prepare(`SELECT subject_id FROM quiz_mystery_pool WHERE level = ?`)
      .bind(data.level)
      .all<{ subject_id: string }>();
    const excludeIds = (existingRows.results ?? []).map((r) => r.subject_id);

    const generated = await generateOneMysteryImage(data.level, excludeIds);
    if (!generated) return { ok: false as const };

    await DB.prepare(`INSERT INTO quiz_mystery_pool (level, subject_id, media_url, status) VALUES (?, ?, ?, 'ready')`)
      .bind(data.level, generated.subject.id, generated.mediaUrl)
      .run();
    return { ok: true as const };
  });

/** Every Mystery Round image from THIS user's own games, newest first — not
 * the shared cross-user pool (that's an internal credit-saving mechanism,
 * not something to surface as "everyone's gallery"). A row qualifies once
 * this user has actually been served it, whether freshly generated for them
 * or reused from another user's earlier generation. */
export const getMysteryGallery = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new Error("unauthorized");
  const { DB } = bindings();
  if (!DB) throw new Error("D1 binding missing");

  const rows = await DB.prepare(
    `SELECT p.id, p.level, p.subject_id, p.media_url, p.created_at
     FROM quiz_mystery_pool p
     JOIN quiz_mystery_seen s ON s.pool_id = p.id AND s.user_id = ?
     ORDER BY p.created_at DESC LIMIT 60`,
  )
    .bind(auth.user.id)
    .all<{
      id: number;
      level: number;
      subject_id: string;
      media_url: string;
      created_at: string;
    }>();

  return (rows.results ?? []).map((r) => {
    const subject = MYSTERY_SUBJECTS.find((s) => s.id === r.subject_id);
    return {
      id: r.id,
      level: r.level as 1 | 2 | 3,
      category: subject?.category ?? null,
      mediaUrl: r.media_url,
      answer: subject ? subject.options[subject.correctIndex] : "Unknown",
      createdAt: r.created_at,
    };
  });
});
