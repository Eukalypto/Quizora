import { createServerFn } from "@tanstack/react-start";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import { getUserSnapshot } from "@/lib/quiz/db.server";
import { syncEntitlementsFromRevenueCat } from "@/lib/quiz/entitlements.server";

class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

async function requireUserAndDb() {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new UnauthorizedError();
  const { DB } = bindings();
  if (!DB) throw new Error("D1 binding missing — check app.manifest.json");
  return { userId: auth.user.id, db: DB };
}

// Client-triggered entitlement sync, called right after purchasePackage()/
// restorePurchases() resolve (see profile-view.tsx's RemoveAdsSection). Not
// just belt-and-suspenders: a restore doesn't always produce a new
// RevenueCat webhook event (no new transaction), so this is the only path
// that reliably catches a restore server-side.
export const syncMyEntitlements = createServerFn({ method: "POST" }).handler(async () => {
  const { userId, db } = await requireUserAndDb();
  const { REVENUECAT_SECRET_API_KEY } = bindings();
  if (!REVENUECAT_SECRET_API_KEY) throw new Error("RevenueCat not configured");
  await syncEntitlementsFromRevenueCat(db, REVENUECAT_SECRET_API_KEY, userId);
  return getUserSnapshot(db, userId);
});
