// Server-only auth guard. Every server function that reads/writes a player's
// quiz_users row must call this first and stop on `ok: false`.

import { auth, clerkClient } from "@clerk/tanstack-react-start/server";
import { getClerkWorkerKeys } from "./clerk-worker-env";

export interface AuthenticatedUser {
  id: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

type AuthResult =
  | { ok: true; user: AuthenticatedUser }
  | { ok: false; status: number; body: unknown };

export async function requireCurrentUser(): Promise<AuthResult> {
  const { userId } = await auth();
  if (!userId) {
    return { ok: false, status: 401, body: { error: "unauthorized" } };
  }

  const user = await clerkClient(await getClerkWorkerKeys()).users.getUser(userId);
  return {
    ok: true,
    user: {
      id: user.id,
      name: user.fullName ?? user.username ?? null,
      email: user.primaryEmailAddress?.emailAddress ?? null,
      avatar_url: user.imageUrl ?? null,
    },
  };
}
