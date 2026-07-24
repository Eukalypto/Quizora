import { useQuery } from "@tanstack/react-query";

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
  return useQuery({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
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
