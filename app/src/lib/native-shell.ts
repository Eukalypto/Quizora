// Support for the Capacitor-bundled build (see scripts/build-mobile-shell.mjs
// and capacitor.config.ts): that build's index.html is served from
// capacitor://localhost (iOS) or https://localhost (Android), NOT from
// LIVE_ORIGIN — but all game data still lives behind the live Worker. Every
// root-relative request (server functions, /api/* routes, image URLs) must
// be redirected there, and carry a Bearer token since cross-origin requests
// don't carry the session cookie.
//
// Detected via the window.Capacitor global Capacitor itself injects at
// runtime — deliberately NOT importing @capacitor/core here, since this
// file is also imported from the isomorphic src/start.ts, which is bundled
// into the Cloudflare Worker (SSR) build.
export const LIVE_ORIGIN = "https://quizora.quizora.workers.dev";

declare global {
  interface Window {
    Capacitor?: { isNativePlatform: () => boolean };
    Clerk?: {
      session?: { getToken: () => Promise<string | null> } | null;
      signOut: (opts?: { redirectUrl?: string }) => Promise<void>;
      openSignIn: (opts?: Record<string, unknown>) => void;
    };
  }
}

export function isNativeShell(): boolean {
  return typeof window !== "undefined" && (window.Capacitor?.isNativePlatform() ?? false);
}

// Prefixes root-relative URLs with the live Worker origin when running in
// the bundled native shell; a no-op on the regular website (same origin).
export function withOrigin(path: string): string {
  if (!isNativeShell() || !path.startsWith("/")) return path;
  return LIVE_ORIGIN + path;
}

// Cookie-based sessions don't cross the native shell's origin boundary —
// attach the Clerk session JWT as a Bearer token instead. Clerk's backend
// SDK (clerkMiddleware's acceptsToken: "any") already accepts either.
export async function nativeAuthHeaders(): Promise<HeadersInit> {
  if (!isNativeShell()) return {};
  const token = await window.Clerk?.session?.getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
