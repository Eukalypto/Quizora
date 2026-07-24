-- Global (not per-user) record of which questions have already appeared in a
-- past weekly challenge set, so the shared set never repeats a question
-- across different weeks while staying identical for every player within a
-- given week (that invariant is intentional — weekly scores are meant to be
-- comparable across players).
CREATE TABLE IF NOT EXISTS quiz_weekly_used_questions (
  question_id INTEGER PRIMARY KEY,
  week TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT (datetime('now'))
);
