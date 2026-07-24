-- Redesign: Challenge mode is 2 rounds, each played by BOTH players (fair,
-- same-questions comparison) but handed back and forth asynchronously via
-- the share link, not a shared live session. Only test rows exist so far —
-- safe to drop and recreate rather than migrate.
DROP TABLE IF EXISTS quiz_challenges;

CREATE TABLE quiz_challenges (
  id TEXT PRIMARY KEY,
  creator_user_id TEXT NOT NULL REFERENCES quiz_users(id),
  creator_name TEXT,
  creator_platform_avatar TEXT,
  opponent_user_id TEXT,
  opponent_name TEXT,
  opponent_platform_avatar TEXT,

  -- Round 1: creator's category, played by creator first, then opponent.
  round1_category_key TEXT NOT NULL,
  round1_question_ids TEXT NOT NULL, -- JSON array of 10 question ids
  round1_creator_correct INTEGER,
  round1_creator_total INTEGER,
  round1_creator_score INTEGER,
  round1_creator_completed_at TEXT,
  round1_opponent_correct INTEGER,
  round1_opponent_total INTEGER,
  round1_opponent_score INTEGER,
  round1_opponent_completed_at TEXT,

  -- Round 2: opponent's category (picked after their round 1), played by
  -- opponent first, then creator. NULL until the opponent starts it.
  round2_category_key TEXT,
  round2_question_ids TEXT,
  round2_opponent_correct INTEGER,
  round2_opponent_total INTEGER,
  round2_opponent_score INTEGER,
  round2_opponent_completed_at TEXT,
  round2_creator_correct INTEGER,
  round2_creator_total INTEGER,
  round2_creator_score INTEGER,
  round2_creator_completed_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_creator ON quiz_challenges(creator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quiz_challenges_opponent ON quiz_challenges(opponent_user_id, created_at DESC);
