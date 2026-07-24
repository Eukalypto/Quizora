-- Daily/Weekly's 2 AI-generated "guess the image" questions (reusing the
-- Mystery Round's shared quiz_mystery_pool). Weekly is shared, not per-user,
-- so — unlike Daily, which just calls the pool helper live each time — the
-- specific images/option order picked for a given week need to be persisted
-- once and re-served identically to every player that week.
CREATE TABLE IF NOT EXISTS quiz_weekly_ai_questions (
  week TEXT NOT NULL,
  question_index INTEGER NOT NULL, -- 0 or 1
  pool_id INTEGER NOT NULL, -- quiz_mystery_pool.id; used to derive a stable, globally-unique synthetic Question id
  subject_id TEXT NOT NULL,
  media_url TEXT NOT NULL,
  level INTEGER NOT NULL,
  options_json TEXT NOT NULL, -- JSON array of 4 option strings, pre-shuffled
  correct_index INTEGER NOT NULL,
  PRIMARY KEY (week, question_index)
);

-- Mirrors quiz_weekly_used_questions (never repeat a JSON question across
-- weeks) for the AI-generated pair — a subject used in one week's weekly
-- set is excluded from every future week's.
CREATE TABLE IF NOT EXISTS quiz_weekly_used_mystery_subjects (
  subject_id TEXT NOT NULL,
  week TEXT NOT NULL,
  used_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (subject_id, week)
);
