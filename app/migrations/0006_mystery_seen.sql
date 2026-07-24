-- Cross-user reuse of Mystery Round images: previously, once a pool row was
-- served to one user it flipped to 'used' and was retired forever, so every
-- other user's questions always cost a fresh generation. This table tracks
-- which (user, image) pairs have actually been shown, so ANY previously
-- generated image can be re-served to any OTHER user who hasn't seen it yet —
-- the shared pool grows over time and future plays increasingly reuse it
-- instead of spending credits on a new generation.
CREATE TABLE IF NOT EXISTS quiz_mystery_seen (
  user_id TEXT NOT NULL REFERENCES quiz_users(id),
  pool_id INTEGER NOT NULL REFERENCES quiz_mystery_pool(id),
  seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, pool_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_mystery_seen_user_id ON quiz_mystery_seen(user_id);

-- Backfill: rows already marked 'used' were shown to their used_by_user_id —
-- record that so that user isn't immediately re-served the same image.
INSERT INTO quiz_mystery_seen (user_id, pool_id)
SELECT used_by_user_id, id FROM quiz_mystery_pool
WHERE used_by_user_id IS NOT NULL
ON CONFLICT (user_id, pool_id) DO NOTHING;
