import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/tanstack-react-start";

export interface CurrentUser {
  id: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

async function fetchCurrentUser(): Promise<CurrentUser | null> {
  const response = await fetch("/api/user", { credentials: "include" });
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

declare global {
  interface Window {
    Clerk?: { signOut: (opts?: { redirectUrl?: string }) => Promise<void> };
  }
}

export function loginRedirect(returnPath = window.location.pathname + window.location.search) {
  window.location.href = `/sign-in?redirect_url=${encodeURIComponent(returnPath)}`;
}

export async function logoutRedirect(returnPath = "/") {
  if (window.Clerk) {
    await window.Clerk.signOut({ redirectUrl: returnPath });
    return;
  }
  window.location.href = returnPath;
}
