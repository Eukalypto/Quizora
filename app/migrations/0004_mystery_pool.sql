-- AI Mystery Round: a shared pre-generated image bank (not per-user) so most
-- requests serve instantly instead of waiting on a live generation. Consuming
-- a ready row triggers a client-fired (fire-and-forget) replenish call that
-- generates one replacement in its own request/response cycle.
CREATE TABLE IF NOT EXISTS quiz_mystery_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level INTEGER NOT NULL,          -- 1 | 2 | 3
  subject_id TEXT NOT NULL,        -- id from mystery-subjects.json
  media_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready',  -- 'ready' | 'used'
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quiz_mystery_pool_level_status ON quiz_mystery_pool(level, status);

-- Per-user daily play cap (5/day) for the Mystery Round, since every question
-- is a real Higgsfield generation.
CREATE TABLE IF NOT EXISTS quiz_mystery_daily (
  user_id TEXT NOT NULL REFERENCES quiz_users(id),
  play_date TEXT NOT NULL,   -- YYYY-MM-DD
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, play_date)
);

-- Seed bank: 5 ready images per difficulty tier, generated ahead of time so
-- the first players don't pay the generation wait.
INSERT INTO quiz_mystery_pool (level, subject_id, media_url, status) VALUES
  (1, 'm1', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202122_763f727f-1b8a-4ac0-b015-276dce5e83c5.png', 'ready'),
  (1, 'm2', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202123_badce826-e1e9-40d4-8a27-4747c9ac3230.png', 'ready'),
  (1, 'm3', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202124_548e53fb-88de-42c6-be1e-5b2f08a765b1.png', 'ready'),
  (1, 'm4', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202125_39c471b3-ec92-4b82-9b00-700d28c48a9e.png', 'ready'),
  (1, 'm5', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202422_412292a3-7662-41d0-9a1f-ad41cb6fe8b8.png', 'ready'),
  (2, 'm7', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202423_d97d6c5a-d11d-47b8-89da-43c2040c3412.png', 'ready'),
  (2, 'm8', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202425_8cb53d36-bb62-4336-8e73-0c02fecd75d5.png', 'ready'),
  (2, 'm9', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202426_342e10de-17f5-47a8-ba6d-5300ddc5b4a4.png', 'ready'),
  (2, 'm10', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202519_db78ba14-2633-40eb-ba33-177d6e79a4a5.png', 'ready'),
  (2, 'm11', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202520_068890f5-0c30-4bba-8ca5-934fdfd666ae.png', 'ready'),
  (3, 'm13', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202522_27e46e70-9091-419d-aa96-3228829a8375.png', 'ready'),
  (3, 'm14', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202523_20e1af25-9dc5-412a-b766-5dac1b45ff9a.png', 'ready'),
  (3, 'm15', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202617_453ae54a-e571-4b0a-8a7c-c45ba1d04bf8.png', 'ready'),
  (3, 'm16', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202618_92b7918b-767f-41a3-80c0-8b307389d510.png', 'ready'),
  (3, 'm17', 'https://d8j0ntlcm91z4.cloudfront.net/user_395pfIGpMYSrNIR7bnXdxPtFdE7/hf_20260720_202620_8deeb3dd-f04e-45ce-9080-a935b564005f.png', 'ready');
