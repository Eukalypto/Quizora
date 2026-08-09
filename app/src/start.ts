import { clerkMiddleware } from "@clerk/tanstack-react-start/server";
import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { getClerkWorkerKeys } from "./lib/clerk-worker-env";
import { isNativeShell, nativeAuthHeaders, withOrigin } from "./lib/native-shell";

// The two origins the Capacitor-bundled shell's WebView runs on (see
// capacitor.config.ts) — the only cross-origin callers server functions and
// the CSRF check below should ever accept.
const NATIVE_SHELL_ORIGINS = ["capacitor://localhost", "https://localhost"];

// GET requests (e.g. getSnapshot) don't reliably carry an Origin header even
// cross-origin — only Sec-Fetch-Site. Referer still carries the full URL
// there, so fall back to its origin rather than treating "no Origin" as "no
// cross-origin caller" and rejecting a legitimate native-shell request.
function getRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (origin) return origin;
  const referer = request.headers.get("Referer");
  if (!referer) return null;
  try {
    // URL#origin is the literal string "null" for non-special schemes like
    // capacitor: (a WHATWG spec quirk) — protocol/host still parse
    // correctly, so reconstruct the origin from those instead.
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

// Server functions normally call same-origin ("/_serverFn/..."); the bundled
// native shell has no server of its own, so its calls must be redirected to
// the live Worker and carry a Bearer token (see native-shell.ts) instead of
// the session cookie, which doesn't cross the origin boundary.
const nativeAwareServerFnFetch: typeof fetch = async (input, init) => {
  if (!isNativeShell()) return fetch(input, init);
  const headers = new Headers(init?.headers);
  const authHeaders = await nativeAuthHeaders();
  for (const [key, value] of Object.entries(authHeaders)) headers.set(key, value);
  return fetch(withOrigin(String(input)), { ...init, headers });
};

// The bundled native shell calls this Worker cross-origin (its own origin
// has no server) — the browser needs CORS headers to hand the response back
// to JS at all, on top of the auth/CSRF allowances above. Ordered first so
// OPTIONS preflights short-circuit before Clerk/CSRF run, and so the header
// still gets attached to error responses from later middleware.
const corsMiddleware = createMiddleware().server(async ({ request, next }) => {
  const origin = getRequestOrigin(request);
  const allowed = origin !== null && NATIVE_SHELL_ORIGINS.includes(origin);
  if (!allowed) return next();

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, x-tsr-serverFn",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
      },
    });
  }

  const result = await next();
  result.response.headers.set("Access-Control-Allow-Origin", origin);
  result.response.headers.append("Vary", "Origin");
  return result;
});

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
  // Sec-Fetch-Site is checked before Origin/Referer, so the default
  // same-origin-only check would reject every native-shell server-fn call
  // outright (its origin is never the Worker's). Carve out exactly the two
  // known Capacitor origins; everything else still needs same-origin.
  secFetchSite: (value, ctx) => {
    if (value === "same-origin") return true;
    const origin = getRequestOrigin(ctx.request);
    return origin !== null && NATIVE_SHELL_ORIGINS.includes(origin);
  },
});

export const startInstance = createStart(() => ({
  requestMiddleware: [corsMiddleware, clerkMiddleware(getClerkWorkerKeys), csrfMiddleware, errorMiddleware],
  serverFns: { fetch: nativeAwareServerFnFetch },
}));
