import { createServerFn } from "@tanstack/react-start";
import { clerkClient } from "@clerk/tanstack-react-start/server";
import { bindings } from "@/lib/bindings.server";
import { requireCurrentUser } from "@/lib/auth.server";
import { getClerkWorkerKeys } from "@/lib/clerk-worker-env";
import { deleteUserAccountData } from "@/lib/quiz/account-deletion.server";

// Permanently deletes the current user's account: all Quizora data (D1 +
// their R2 avatar) and the Clerk identity itself. Irreversible — the client
// must confirm before calling this. Used by both the in-app Delete Account
// flow (profile-view.tsx) and the standalone web deletion page required by
// Google Play (src/routes/account/delete.tsx) — same server function either
// way, since the account-deletion requirement doesn't distinguish how the
// request was made.
export const deleteMyAccount = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await requireCurrentUser();
  if (!auth.ok) throw new Error("unauthorized");

  const { DB, STORAGE } = bindings();
  if (!DB) throw new Error("D1 binding missing");

  await deleteUserAccountData(DB, STORAGE, auth.user.id);
  await clerkClient(await getClerkWorkerKeys()).users.deleteUser(auth.user.id);

  return { ok: true as const };
});
