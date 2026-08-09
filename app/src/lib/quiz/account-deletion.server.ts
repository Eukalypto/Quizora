// Account deletion — required by both the App Store (5.1.1(v)) and Google
// Play (must let users delete their account and data, in-app and via a web
// resource — see src/routes/account/delete.tsx). Purges everything scoped
// to a single user; leaves shared/multi-party data intact where deleting it
// would destroy another player's own records too (see quiz_challenges below).
import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

const SOLE_OWNER_TABLES = [
  "quiz_history",
  "quiz_weekly_history",
  "quiz_seen_questions",
  "quiz_category_plays",
  "quiz_badges_seen",
  "quiz_result_cards",
  "quiz_mystery_daily",
  "quiz_mystery_seen",
] as const;

export async function deleteUserAccountData(db: D1Database, storage: R2Bucket | undefined, userId: string): Promise<void> {
  const statements = SOLE_OWNER_TABLES.map((table) =>
    db.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId),
  );

  // quiz_mystery_pool rows are shared content (curated images other players
  // also draw from) — only clear this user's attribution, never the row.
  statements.push(
    db.prepare(`UPDATE quiz_mystery_pool SET used_by_user_id = NULL WHERE used_by_user_id = ?`).bind(userId),
  );

  // quiz_challenges is a two-party record. As creator, the challenge is the
  // deleted user's own creation — remove it entirely (creator_user_id is
  // NOT NULL, so the row can't be kept without them). As opponent, the
  // creator's own history shouldn't disappear because the OTHER player left
  // — anonymize this user's side instead of deleting the row.
  statements.push(db.prepare(`DELETE FROM quiz_challenges WHERE creator_user_id = ?`).bind(userId));
  statements.push(
    db
      .prepare(
        `UPDATE quiz_challenges
         SET opponent_user_id = NULL, opponent_name = NULL, opponent_platform_avatar = NULL
         WHERE opponent_user_id = ?`,
      )
      .bind(userId),
  );

  statements.push(db.prepare(`DELETE FROM quiz_users WHERE id = ?`).bind(userId));

  await db.batch(statements);

  if (storage) {
    await storage.delete(`user-avatars/${userId}.png`);
  }
}
