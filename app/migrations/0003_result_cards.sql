-- Player-generated "victory card" images (real in-app Higgsfield generation,
-- triggered after a completed solo or live-play result). Additive only.

CREATE TABLE IF NOT EXISTS quiz_result_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES quiz_users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  mode TEXT NOT NULL,          -- 'daily' | 'weekly' | 'freeplay' | 'duo' | 'teams'
  headline TEXT NOT NULL,      -- the line rendered on the card, kept for the gallery caption
  media_url TEXT NOT NULL,
  job_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_quiz_result_cards_user ON quiz_result_cards(user_id, created_at DESC);
