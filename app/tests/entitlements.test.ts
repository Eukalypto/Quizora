import { describe, expect, test } from "bun:test";
import { findStore } from "../src/lib/quiz/entitlements.server";
import { handleRevenueCatWebhook } from "../src/routes/api/webhooks/revenuecat";

describe("findStore", () => {
  test("finds the store on a subscription product", () => {
    const body = { entitlements: {}, subscriptions: { "removeads.monthly": { store: "APP_STORE" } } };
    expect(findStore(body, "removeads.monthly")).toBe("APP_STORE");
  });

  test("finds the store on a non-subscription (one-time) product", () => {
    const body = { entitlements: {}, non_subscriptions: { "removeads.lifetime": [{ store: "PLAY_STORE" }] } };
    expect(findStore(body, "removeads.lifetime")).toBe("PLAY_STORE");
  });

  test("returns null when the product isn't found in either map", () => {
    const body = { entitlements: {} };
    expect(findStore(body, "unknown.product")).toBeNull();
  });
});

describe("handleRevenueCatWebhook", () => {
  const okEnv = { REVENUECAT_WEBHOOK_SECRET: "shh", REVENUECAT_SECRET_API_KEY: "sk_test", DB: {} as any };

  test("returns 501 when RevenueCat secrets aren't configured", async () => {
    const request = new Request("https://example.com/api/webhooks/revenuecat", { method: "POST" });
    const response = await handleRevenueCatWebhook(request, {});
    expect(response.status).toBe(501);
  });

  test("returns 401 when the Authorization header doesn't match", async () => {
    const request = new Request("https://example.com/api/webhooks/revenuecat", {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
    });
    const response = await handleRevenueCatWebhook(request, okEnv);
    expect(response.status).toBe(401);
  });

  test("returns 500 when the Authorization header matches but D1 isn't bound", async () => {
    const request = new Request("https://example.com/api/webhooks/revenuecat", {
      method: "POST",
      headers: { authorization: "Bearer shh" },
    });
    const response = await handleRevenueCatWebhook(request, { ...okEnv, DB: undefined });
    expect(response.status).toBe(500);
  });

  test("short-circuits RC's test-event type without touching D1", async () => {
    const request = new Request("https://example.com/api/webhooks/revenuecat", {
      method: "POST",
      headers: { authorization: "Bearer shh", "content-type": "application/json" },
      body: JSON.stringify({ event: { type: "TEST", id: "evt_1", app_user_id: "not-real" } }),
    });
    const response = await handleRevenueCatWebhook(request, okEnv);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.test).toBe(true);
  });
});
