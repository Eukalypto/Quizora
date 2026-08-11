-- Generic RevenueCat-backed entitlements (Monetization v1). Replaces the
-- never-populated remove_ads_lifetime/remove_ads_expires_at columns from
-- 0014 with a table keyed by entitlement id, so a future entitlement (e.g.
-- a Live Mode content pack, once EUK-36 lands) is just another row here —
-- no new migration needed. The old columns are left in place (additive-only
-- migrations) but are no longer read or written.
CREATE TABLE IF NOT EXISTS quiz_entitlements (
  user_id TEXT NOT NULL REFERENCES quiz_users(id),
  entitlement_id TEXT NOT NULL,        -- RevenueCat entitlement id, e.g. "remove_ads"
  is_active INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,                     -- NULL = non-expiring (lifetime)
  product_id TEXT,                     -- store product id that granted it (debugging)
  store TEXT,                          -- APP_STORE | PLAY_STORE | ...
  latest_event_type TEXT,              -- last RevenueCat webhook event type observed
  latest_event_id TEXT,                -- last RevenueCat event id observed
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, entitlement_id)
);
CREATE INDEX IF NOT EXISTS idx_quiz_entitlements_user ON quiz_entitlements(user_id);
