import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { D1Database } from "@cloudflare/workers-types";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import { MYSTERY_SUBJECTS } from "@/lib/quiz/mystery";
import { getMysteryPoolQuestion } from "@/lib/quiz/mystery-pool.server";
import { todayIso } from "@/lib/quiz/scoring";

// Pacing cap on Mystery Round plays — not a cost control (images are curated,
// not generated), just keeps the mode from being an infinite XP farm. Easy to
// retune; not tied to any generation budget anymore.
const DAILY_LIMIT = 7;
const levelSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

async function incrementDailyCount(db: D1Database, userId: string, today: string): Promise<void> {
  await db
    .prepare(
      `INSERT INTO quiz_mystery_daily (user_id, play_date, count) VALUES (?, ?, 1)
       ON CONFLICT (user_id, play_date) DO UPDATE SET count = count + 1`,
    )
    .bind(userId, today)
    .run();
}

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

const drawInput = z.object({
  level: levelSchema,
  excludeIds: z.array(z.string()).default([]),
});

/** Draws one curated "guess the image" question from the pool — instant,
 * no generation wait. `errorCode: "no_images_available"` means nothing
 * curated has been uploaded/synced for this level yet (see
 * mystery-sync.server.ts) — not a failure, just empty content. */
export const drawMysteryQuestion = createServerFn({ method: "POST" })
  .validator(drawInput)
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

    const picked = await getMysteryPoolQuestion(DB, auth.user.id, data.level, data.excludeIds);
    if (!picked) {
      return { ok: false as const, errorCode: "no_images_available" as const };
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

/** Every Mystery Round image from THIS user's own games, newest first — not
 * the shared cross-user pool (that's an internal reuse mechanism, not
 * something to surface as "everyone's gallery"). A row qualifies once this
 * user has actually been served it. */
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
