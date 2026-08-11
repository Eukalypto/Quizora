import type { D1Database } from "@cloudflare/workers-types";
import { ensureUser } from "./db.server";

// Generic RevenueCat entitlement sync (Monetization v1). Every inbound
// webhook call (see src/routes/api/webhooks/revenuecat.ts) and every
// client-triggered post-purchase/restore call (see
// src/lib/api/purchases.functions.ts) re-fetches this user's FULL current
// entitlement state from RevenueCat's own REST API and upserts it wholesale
// into quiz_entitlements, rather than parsing individual webhook event
// payloads (which vary subtly by type — CANCELLATION isn't immediately
// inactive, BILLING_ISSUE may be in a grace period, TRANSFER moves
// entitlements between users, etc.). This trades one extra outbound HTTP
// call per sync for: no per-event-type branching, and free idempotency — a
// duplicate/out-of-order webhook delivery just re-writes the same state.

interface RevenueCatEntitlement {
  expires_date: string | null;
  product_identifier: string;
}

interface RevenueCatSubscriberResponse {
  subscriber: {
    entitlements: Record<string, RevenueCatEntitlement>;
    subscriptions?: Record<string, { store?: string }>;
    non_subscriptions?: Record<string, Array<{ store?: string }>>;
  };
}

// The exact response shape (particularly where `store` lives — it's on the
// subscription/non_subscription entry, not the entitlement itself in the v1
// API) should be re-verified against RevenueCat's current docs at first real
// integration test; this defensively falls back to null rather than
// asserting a shape that may have drifted.
export function findStore(body: RevenueCatSubscriberResponse["subscriber"], productId: string): string | null {
  const sub = body.subscriptions?.[productId];
  if (sub?.store) return sub.store;
  const nonSub = body.non_subscriptions?.[productId]?.[0];
  return nonSub?.store ?? null;
}

async function fetchRevenueCatSubscriber(
  secretApiKey: string,
  appUserId: string,
): Promise<RevenueCatSubscriberResponse["subscriber"]> {
  const response = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretApiKey}` },
  });
  if (!response.ok) {
    throw new Error(`RevenueCat subscriber lookup failed: ${response.status}`);
  }
  const body = (await response.json()) as RevenueCatSubscriberResponse;
  return body.subscriber;
}

/** Re-fetches `appUserId`'s full entitlement state from RevenueCat and
 * upserts it into quiz_entitlements — every entitlement RC currently
 * reports becomes an active row; every entitlement this user previously had
 * that RC no longer reports gets flipped inactive (covers real expiry,
 * refunds, etc. without needing to parse the triggering event). */
export async function syncEntitlementsFromRevenueCat(
  db: D1Database,
  secretApiKey: string,
  appUserId: string,
  event?: { type?: string; id?: string },
): Promise<void> {
  await ensureUser(db, appUserId);
  const subscriber = await fetchRevenueCatSubscriber(secretApiKey, appUserId);
  const activeIds = Object.keys(subscriber.entitlements);

  const upserts = activeIds.map((entitlementId) => {
    const ent = subscriber.entitlements[entitlementId];
    return db
      .prepare(
        `INSERT INTO quiz_entitlements (user_id, entitlement_id, is_active, expires_at, product_id, store, latest_event_type, latest_event_id, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT (user_id, entitlement_id) DO UPDATE SET
           is_active = 1, expires_at = excluded.expires_at, product_id = excluded.product_id,
           store = excluded.store, latest_event_type = excluded.latest_event_type,
           latest_event_id = excluded.latest_event_id, updated_at = datetime('now')`,
      )
      .bind(
        appUserId,
        entitlementId,
        ent.expires_date,
        ent.product_identifier,
        findStore(subscriber, ent.product_identifier),
        event?.type ?? null,
        event?.id ?? null,
      );
  });
  if (upserts.length > 0) await db.batch(upserts);

  // Anything this user previously had that RC no longer reports as active
  // (expired, refunded, transferred away, ...) gets flipped inactive. Safe
  // to run even when activeIds is empty (deactivates everything).
  const placeholders = activeIds.map(() => "?").join(", ");
  const notInClause = activeIds.length > 0 ? `AND entitlement_id NOT IN (${placeholders})` : "";
  await db
    .prepare(
      `UPDATE quiz_entitlements SET is_active = 0, updated_at = datetime('now')
       WHERE user_id = ? AND is_active = 1 ${notInClause}`,
    )
    .bind(appUserId, ...activeIds)
    .run();
}

export async function getActiveEntitlementIds(db: D1Database, userId: string): Promise<Set<string>> {
  const rows = await db
    .prepare(`SELECT entitlement_id FROM quiz_entitlements WHERE user_id = ? AND is_active = 1`)
    .bind(userId)
    .all<{ entitlement_id: string }>();
  return new Set((rows.results ?? []).map((r) => r.entitlement_id));
}
