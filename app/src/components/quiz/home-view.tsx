import { Send, Swords, User as UserIcon, Wand2 } from "lucide-react";
import { Avatar } from "@higgsfield/quanta/avatar";
import { Button } from "@higgsfield/quanta/button";
import { Typography } from "@higgsfield/quanta/typography";
import { loginRedirect, type CurrentUser } from "@/hooks/use-current-user";
import { withOrigin } from "@/lib/native-shell";

export function HomeView({
  user,
  avatarUrl,
  onOpenSolo,
  onOpenMultiplayer,
  onOpenMystery,
  onOpenChallenge,
  onOpenProfile,
}: {
  user: CurrentUser | null | undefined;
  avatarUrl?: string | null;
  onOpenSolo: () => void;
  onOpenMultiplayer: () => void;
  onOpenMystery: () => void;
  onOpenChallenge: () => void;
  onOpenProfile?: () => void;
}) {
  const rawAvatar = avatarUrl ?? (user?.avatar_url as string | undefined);
  const displayAvatar = rawAvatar ? withOrigin(rawAvatar) : rawAvatar;

  return (
    <div className="relative flex h-full min-h-0 flex-col items-center justify-center gap-10 p-6 text-center">
      {displayAvatar && onOpenProfile ? (
        <button
          type="button"
          onClick={onOpenProfile}
          aria-label="Open your profile"
          className="absolute right-4 top-4 rounded-q-full transition-opacity hover:opacity-80"
        >
          <Avatar size="md" src={displayAvatar} alt={user?.name ?? "Your profile"} />
        </button>
      ) : null}
      <div className="flex flex-col items-center gap-3">
        <img src="/assets/landing/logo.png" alt="" className="size-16 rounded-q-500 shadow-q-raised" />
        <Typography as="h1" variant="headline-md-semi-bold" color="primary">
          Quizora
        </Typography>
      </div>

      {user === null ? (
        <div className="flex flex-col items-center gap-3">
          <Typography as="p" variant="body-sm-regular" color="secondary" className="max-w-xs">
            Sign in to save your streak, XP, and badges.
          </Typography>
          <Button variant="secondary" size="md" onClick={() => loginRedirect()}>
            Sign in
          </Button>
        </div>
      ) : (
        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button variant="primary" size="lg" start={<UserIcon className="size-4" aria-hidden />} onClick={onOpenSolo}>
            Solo Game
          </Button>
          <Button variant="secondary" size="lg" start={<Send className="size-4" aria-hidden />} onClick={onOpenChallenge}>
            Challenge
          </Button>
          <Button variant="marketingPrimary" size="lg" start={<Wand2 className="size-4" aria-hidden />} onClick={onOpenMystery}>
            Mystery Round
          </Button>
          <Button variant="secondary" size="lg" start={<Swords className="size-4" aria-hidden />} onClick={onOpenMultiplayer}>
            Live Play
          </Button>
        </div>
      )}
    </div>
  );
}
