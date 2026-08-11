// RevenueCat client bootstrap — native shell only. StoreKit/Play Billing
// don't exist on web, and there's no web purchase path per the agreed
// Monetization v1 plan (no Stripe). @revenuecat/purchases-capacitor is
// dynamically imported so it never enters the SSR/web bundle, mirroring how
// __root.tsx loads the design inspector.
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/tanstack-react-start";
import { isNativeShell } from "@/lib/native-shell";

const IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined;
const ANDROID_API_KEY = import.meta.env.VITE_REVENUECAT_ANDROID_KEY as string | undefined;

function apiKeyForPlatform(): string | undefined {
  const platform = window.Capacitor?.getPlatform();
  if (platform === "ios") return IOS_API_KEY;
  if (platform === "android") return ANDROID_API_KEY;
  return undefined;
}

// Tiny module-level store for "is RevenueCat logged in as the current Clerk
// user" — read by RemoveAdsSection (see profile-view.tsx) to gate purchase
// buttons. Not React Context: useRevenueCatIdentity() is mounted exactly
// once, at the app root, so this is the one piece of state a distant child
// needs from it; a full Context provider would be more ceremony for one
// boolean than this subscriber pattern.
let readyState = false;
const listeners = new Set<() => void>();
function setReadyState(value: boolean) {
  readyState = value;
  listeners.forEach((l) => l());
}

/** Whether RevenueCat is currently logged in AS THE CURRENT CLERK USER —
 * not just whether Clerk itself is signed in. logIn() (see
 * useRevenueCatIdentity below) is async, so there's a real window, however
 * brief, after Clerk resolves where RevenueCat is still anonymous; a
 * purchase made in that window would attach to an alias the backend can't
 * map back to a quiz_users row. Purchase UI should stay disabled until this
 * is true. Always false on web (RevenueCat never configures there). */
export function useRevenueCatReady(): boolean {
  const [ready, setReady] = useState(readyState);
  useEffect(() => {
    const listener = () => setReady(readyState);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return ready;
}

/** Configures RevenueCat once on native mount (anonymously — the app may be
 * opened before Clerk resolves a session), then keeps RevenueCat's identity
 * in sync with Clerk's. The Clerk user id IS RevenueCat's appUserID
 * directly — no mapping table — so a webhook's event.app_user_id is usable
 * as quiz_users.id with zero translation (see entitlements.server.ts).
 * Mount exactly once, at the app root (see __root.tsx) — readiness for
 * purchase UI elsewhere is read via useRevenueCatReady() above. */
export function useRevenueCatIdentity(): void {
  const { isLoaded, userId } = useAuth();
  const configured = useRef(false);
  const loggedInAs = useRef<string | null>(null);

  useEffect(() => {
    if (!isNativeShell()) return;

    async function run() {
      const apiKey = apiKeyForPlatform();
      if (!apiKey) return; // no RevenueCat project/keys configured yet

      const { Purchases } = await import("@revenuecat/purchases-capacitor");

      if (!configured.current) {
        await Purchases.configure({ apiKey });
        configured.current = true;
      }

      if (!isLoaded) return;

      if (userId && loggedInAs.current !== userId) {
        setReadyState(false);
        await Purchases.logIn({ appUserID: userId });
        loggedInAs.current = userId;
        setReadyState(true);
      } else if (!userId && loggedInAs.current !== null) {
        setReadyState(false);
        await Purchases.logOut();
        loggedInAs.current = null;
      } else if (userId && loggedInAs.current === userId) {
        setReadyState(true);
      }
    }

    void run();
  }, [isLoaded, userId]);
}
