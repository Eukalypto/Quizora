-- Mystery Round images are now curated (uploaded to R2, synced in) instead
-- of AI-generated — see mystery-sync.server.ts. A unique index on media_url
-- makes the sync idempotent: re-running it after no new uploads is a no-op
-- rather than piling up duplicate rows for the same image.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_mystery_pool_media_url ON quiz_mystery_pool(media_url);
