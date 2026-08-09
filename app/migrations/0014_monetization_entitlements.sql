-- Remove Ads entitlement (Monetization v1, "Convenience" pillar): a lifetime
-- flag plus an optional subscription expiry — entitled if either is set.
ALTER TABLE quiz_users ADD COLUMN remove_ads_lifetime INTEGER NOT NULL DEFAULT 0;
ALTER TABLE quiz_users ADD COLUMN remove_ads_expires_at TEXT;

-- Live Mode content-pack ownership (Monetization v1, "Content" pillar). The
-- free Starter pack isn't tracked here — only paid pack purchases get a row.
CREATE TABLE IF NOT EXISTS quiz_pack_ownership (
  user_id TEXT NOT NULL REFERENCES quiz_users(id),
  pack_key TEXT NOT NULL,
  purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, pack_key)
);
