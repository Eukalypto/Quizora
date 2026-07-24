-- Attribute pool rows to the player who consumed them, so the full
-- generation history can be browsed as a real gallery (every Mystery Round
-- image ever generated, not a trimmed subset).
ALTER TABLE quiz_mystery_pool ADD COLUMN used_by_user_id TEXT;
