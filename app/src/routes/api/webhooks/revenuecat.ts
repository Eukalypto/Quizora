import { createFileRoute } from "@tanstack/react-router";
import type { D1Database } from "@cloudflare/workers-types";
import { bindings } from "@/lib/bindings.server";
import { syncEntitlementsFromRevenueCat } from "@/lib/quiz/entitlements.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { "content-type": "application/json" } });
}

interface RevenueCatWebhookBody {
  event: {
    type: string;
    id: string;
    app_user_id: string;
  };
}

interface WebhookEnv {
  REVENUECAT_WEBHOOK_SECRET?: string;
  REVENUECAT_SECRET_API_KEY?: string;
  DB?: D1Database;
}

// RevenueCat webhook receiver (Monetization v1). Rather than parsing each
// event's payload (types vary subtly — CANCELLATION isn't immediately
// inactive, BILLING_ISSUE may be in a grace period, TRANSFER moves
// entitlements between users, ...), every delivery just re-fetches the
// subscriber's full current state from RevenueCat and re-syncs it — see
// entitlements.server.ts for the reasoning. Always returns 200 fast on
// success; RevenueCat retries non-2xx with backoff.
//
// Extracted from the route's handler (rather than inlined) so it's directly
// unit-testable without needing TanStack Start's route-handler internals —
// see tests/entitlements.test.ts.
export async function handleRevenueCatWebhook(request: Request, env: WebhookEnv): Promise<Response> {
  const { REVENUECAT_WEBHOOK_SECRET, REVENUECAT_SECRET_API_KEY, DB } = env;
  if (!REVENUECAT_WEBHOOK_SECRET || !REVENUECAT_SECRET_API_KEY) {
    return json({ error: "revenuecat_not_configured" }, 501);
  }
  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${REVENUECAT_WEBHOOK_SECRET}`) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!DB) return json({ error: "d1_not_bound" }, 500);

  const body = (await request.json()) as RevenueCatWebhookBody;
  const { event } = body;

  // RC dashboard's "Send Test Event" button — app_user_id isn't real,
  // nothing to sync.
  if (event.type === "TEST") return json({ ok: true, test: true });

  await syncEntitlementsFromRevenueCat(DB, REVENUECAT_SECRET_API_KEY, event.app_user_id, {
    type: event.type,
    id: event.id,
  });
  return json({ ok: true });
}

export const Route = createFileRoute("/api/webhooks/revenuecat")({
  server: {
    handlers: {
      POST: async ({ request }) => handleRevenueCatWebhook(request, bindings()),
    },
  },
});
