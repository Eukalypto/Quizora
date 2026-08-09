import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SignIn, useAuth } from "@clerk/tanstack-react-start";
import { Button } from "@higgsfield/quanta/button";
import { Typography } from "@higgsfield/quanta/typography";
import { useCurrentUser } from "@/hooks/use-current-user";
import { deleteMyAccount } from "@/lib/api/account.functions";

// Standalone, non-app-shell page reachable at quizora's own domain outside
// the native app (e.g. linked from the Play Store listing) — Google Play
// requires a web resource for account deletion in addition to the in-app
// flow (profile-view.tsx), not just the in-app one.
export const Route = createFileRoute("/account/delete")({
  component: Page,
});

function DeleteConfirm({ email }: { email?: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(false);

  if (done) {
    return (
      <Typography as="p" variant="body-sm-regular" color="secondary">
        Your Quizora account and all of its data have been deleted.
      </Typography>
    );
  }

  const handleConfirm = async () => {
    setDeleting(true);
    setError(false);
    try {
      await deleteMyAccount();
      setDone(true);
    } catch {
      setError(true);
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Typography as="p" variant="body-sm-regular" color="secondary">
        This permanently deletes the Quizora account for {email ?? "your account"} — streak, XP, badges, history,
        and avatar. This cannot be undone.
      </Typography>
      {error ? (
        <Typography as="p" variant="body-sm-regular" color="secondary" className="text-q-text-danger">
          Something went wrong. Please try again.
        </Typography>
      ) : null}
      {confirming ? (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setConfirming(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirm} disabled={deleting}>
            {deleting ? "Deleting…" : "Yes, delete my account"}
          </Button>
        </div>
      ) : (
        <Button variant="dangerSoft" size="sm" onClick={() => setConfirming(true)}>
          Delete my account
        </Button>
      )}
    </div>
  );
}

function Page() {
  const { isLoaded, isSignedIn } = useAuth();
  const { data: user } = useCurrentUser();

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <Typography as="h1" variant="title-md-semi-bold" color="primary">
          Delete your Quizora account
        </Typography>
        {!isLoaded ? null : isSignedIn ? (
          <DeleteConfirm email={user?.email} />
        ) : (
          <div className="flex flex-col gap-4">
            <Typography as="p" variant="body-sm-regular" color="secondary">
              Sign in to request deletion of your account and its data.
            </Typography>
            <SignIn routing="hash" forceRedirectUrl="/account/delete" />
          </div>
        )}
      </div>
    </div>
  );
}
