-- Challenge Token economy (Monetization v1, "Competition" pillar — see
-- Online Challenge in the agreed plan). Every player starts with, and is
-- topped up to, 5 free tokens per rolling 24h; each Online Challenge round
-- (creating or joining) costs 1 token per player.
ALTER TABLE quiz_users ADD COLUMN challenge_tokens INTEGER NOT NULL DEFAULT 5;
ALTER TABLE quiz_users ADD COLUMN tokens_last_granted_at TEXT;
