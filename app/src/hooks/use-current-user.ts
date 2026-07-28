import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";
import { isNativeShell, nativeAuthHeaders, withOrigin } from "@/lib/native-shell";

export interface CurrentUser {
  id: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch(withOrigin("/api/user"), {
    credentials: "include",
    headers: await nativeAuthHeaders(),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Failed to load user");
  return response.json();
}

export function useCurrentUser() {
  // Clerk signs in/out via client-side navigation, not a hard reload — a
  // static query key would keep serving the pre-sign-in cached result
  // (typically null) since nothing tells this query the session changed.
  // Keying on userId busts the cache exactly when Clerk's own state does.
  const { isLoaded, userId } = useAuth();
  return useQuery({
    queryKey: ["current-user", userId ?? null],
    queryFn: fetchCurrentUser,
    enabled: isLoaded,
    staleTime: 60_000,
  });
}

// The native shell has no bundled /sign-in page (only /app is prerendered —
// see vite.config.ts's spa.maskPath), so navigating there would 404 against
// the shell's own local origin. Open Clerk's sign-in as an in-app overlay
// instead of navigating away; the website keeps its normal full-page flow.
export function loginRedirect(returnPath = window.location.pathname + window.location.search) {
  if (isNativeShell()) {
    window.Clerk?.openSignIn({ routing: "virtual" });
    return;
  }
  window.location.href = `/sign-in?redirect_url=${encodeURIComponent(returnPath)}`;
}

export async function logoutRedirect(returnPath = "/") {
  const redirectUrl = isNativeShell() ? "/app" : returnPath;
  if (window.Clerk) {
    await window.Clerk.signOut({ redirectUrl });
    return;
  }
  window.location.href = redirectUrl;
}
