// Server-only auth guard. Every server function that reads/writes a player's
// quiz_users row must call this first and stop on `ok: false`.

export interface HiggsfieldUser {
  id: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  [key: string]: unknown;
}

type AuthResult =
  | { ok: true; user: HiggsfieldUser }
  | { ok: false; status: number; body: unknown };

export async function requireCurrentUser(): Promise<AuthResult> {
  const response = await fetch("https://fnf.internal/user");
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, status: response.status, body };
  }

  return { ok: true, user: body as HiggsfieldUser };
}
