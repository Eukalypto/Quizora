-- Async Challenge mode: invite-based 1v1 where each player plays their own
-- 10-question round independently, at their own pace — the creator plays
-- immediately on creating the challenge (no waiting on anyone), the
-- opponent plays whenever they open the link, and results compare once
-- both are done. Not a live/synchronized match — no per-question
-- coordination needed, so each player's round is just recorded as a final
-- aggregate result once they finish (same shape as any other game mode's
-- result), not tracked question-by-question.
CREATE TABLE IF NOT EXISTS quiz_challenges (
  id TEXT PRIMARY KEY,                  -- random shareable code, also the join-link token
  creator_user_id TEXT NOT NULL REFERENCES quiz_users(id),
  -- Platform display name/avatar are only available for the CURRENTLY
  -- authenticated request (no cross-user lookup endpoint exists) — snapshot
  -- each player's own identity at the moment THEY make an authenticated
  -- call (create / join), so the other player can display it without ever
  -- needing to look another user up.
  creator_name TEXT,
  creator_platform_avatar TEXT,
  creator_category_key TEXT,
  creator_correct INTEGER,
  creator_total INTEGER,
  creator_score INTEGER,
  creator_completed_at TEXT,
  opponent_user_id TEXT,                -- set once someone opens the link and picks a category
  opponent_name TEXT,
  opponent_platform_avatar TEXT,
  opponent_category_key TEXT,
  opponent_correct INTEGER,
  opponent_total INTEGER,
  opponent_score INTEGER,
  opponent_completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL              -- 48h from creation; unclaimed invites just expire
);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_creator ON quiz_challenges(creator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_opponent ON quiz_challenges(opponent_user_id, created_at DESC);
