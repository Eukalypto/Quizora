import { useEffect, useState } from "react";
import { Award, Flame, Gamepad2, Images, LogOut, Music, ShieldCheck, ShieldOff, Sparkles, Trash2, Volume2, VolumeX, Wand2 } from "lucide-react";
import { Avatar } from "@higgsfield/quanta/avatar";
import { Button } from "@higgsfield/quanta/button";
import { Modal } from "@higgsfield/quanta/modal";
import { Progress } from "@higgsfield/quanta/progress";
import { toast } from "@higgsfield/quanta/sonner";
import { Typography } from "@higgsfield/quanta/typography";
import { MetricCard, Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import { AvatarCreatorModal } from "@/components/quiz/avatar-creator-modal";
import { logoutRedirect, type CurrentUser } from "@/hooks/use-current-user";
import { deleteMyAccount } from "@/lib/api/account.functions";
import { withOrigin } from "@/lib/native-shell";
import { BADGES } from "@/lib/quiz/badges";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted } from "@/lib/quiz/sound";
import type { UserSnapshot } from "@/lib/quiz/types";

// Purchases aren't wired up yet — no ad network is integrated and no
// App Store/Play Console products exist to charge against (see Monetization
// v1 plan). These buttons are honest about that rather than pretending to
// take payment; swap the onClick for real StoreKit/Play Billing calls once
// those exist.
function RemoveAdsSection({ active }: { active: boolean }) {
  const comingSoon = () => toast.info("Remove Ads is coming soon", { description: "Payments aren't set up yet — check back soon." });

  if (active) {
    return (
      <Section title="Remove Ads">
        <Panel className="flex items-center gap-3">
          <ShieldCheck className="size-5 text-q-icon-success" aria-hidden />
          <Typography as="span" variant="body-sm-regular" color="secondary">
            You're ad-free. Thanks for supporting Quizora!
          </Typography>
        </Panel>
      </Section>
    );
  }

  return (
    <Section title="Remove Ads" description="Ads only ever show in Solo Mode — remove them for good.">
      <Panel className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <ShieldOff className="size-5 text-q-icon-secondary" aria-hidden />
          <Typography as="span" variant="body-sm-regular" color="secondary">
            Go ad-free in Solo Mode
          </Typography>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="xs" onClick={comingSoon}>
            Monthly
          </Button>
          <Button variant="secondary" size="xs" onClick={comingSoon}>
            Yearly
          </Button>
          <Button variant="primary" size="xs" onClick={comingSoon}>
            Lifetime
          </Button>
        </div>
      </Panel>
    </Section>
  );
}

function SettingsSection() {
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    setMuted(isAudioMuted());
    return subscribeAudioMuted(setMuted);
  }, []);

  return (
    <Section title="Settings">
      <Panel className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {muted ? <VolumeX className="size-5 text-q-icon-secondary" aria-hidden /> : <Volume2 className="size-5 text-q-icon-secondary" aria-hidden />}
            <div className="flex flex-col">
              <Typography as="span" variant="body-sm-medium" color="primary">
                Sound effects
              </Typography>
              <Typography as="span" variant="caption-xs-regular" color="tertiary">
                Correct/wrong chimes and streak sounds
              </Typography>
            </div>
          </div>
          <Button variant="secondary" size="xs" onClick={() => setAudioMuted(!muted)}>
            {muted ? "Unmute" : "Mute"}
          </Button>
        </div>
        <div className="flex items-center justify-between gap-3 opacity-50">
          <div className="flex items-center gap-3">
            <Music className="size-5 text-q-icon-secondary" aria-hidden />
            <div className="flex flex-col">
              <Typography as="span" variant="body-sm-medium" color="primary">
                Music
              </Typography>
              <Typography as="span" variant="caption-xs-regular" color="tertiary">
                Coming soon
              </Typography>
            </div>
          </div>
          <Button variant="secondary" size="xs" disabled>
            Mute
          </Button>
        </div>
      </Panel>
    </Section>
  );
}

function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = async () => {
    setDeleting(true);
    try {
      await deleteMyAccount();
      // Account no longer exists — hard-navigate rather than client-route,
      // so no cached query data for the deleted user can flash back in.
      window.location.href = "/";
    } catch {
      toast.error("Couldn't delete your account", { description: "Check your connection and try again." });
      setDeleting(false);
    }
  };

  return (
    <Section title="Danger zone">
      <Panel className="flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <Typography as="span" variant="body-sm-medium" color="primary">
            Delete account
          </Typography>
          <Typography as="span" variant="caption-xs-regular" color="tertiary">
            Permanently erases your streak, XP, badges, and history. Cannot be undone.
          </Typography>
        </div>
        <Modal.Root open={open} onOpenChange={setOpen}>
          <Modal.Trigger
            render={
              <Button variant="dangerSoft" size="xs" start={<Trash2 className="size-4" aria-hidden />}>
                Delete
              </Button>
            }
          />
          <Modal.Content size="sm">
            <Modal.Header>
              <Modal.Title>Delete your account?</Modal.Title>
              <Modal.CloseButton />
            </Modal.Header>
            <Modal.Body>
              <Typography as="p" variant="body-sm-regular" color="secondary">
                This permanently deletes your account and all of its data — streak, XP, badges, history, and
                avatar. This cannot be undone.
              </Typography>
            </Modal.Body>
            <Modal.Footer>
              <Modal.FooterActions>
                <Button variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={deleting}>
                  Cancel
                </Button>
                <Button variant="danger" size="sm" onClick={handleConfirm} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete my account"}
                </Button>
              </Modal.FooterActions>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      </Panel>
    </Section>
  );
}

export function ProfileView({
  user,
  snapshot,
  onOpenBadges,
  onOpenHistory,
  onOpenMysteryGallery,
  onAvatarSaved,
}: {
  user: CurrentUser;
  snapshot: UserSnapshot;
  onOpenBadges: () => void;
  onOpenHistory: () => void;
  onOpenMysteryGallery: () => void;
  onAvatarSaved: () => void;
}) {
  const unlocked = BADGES.filter((b) => snapshot.unlockedBadgeIds.includes(b.id));
  const rawAvatar = snapshot.avatarUrl ?? (user.avatar_url as string | undefined);
  const displayAvatar = rawAvatar ? withOrigin(rawAvatar) : rawAvatar;

  return (
    <Page>
      <PageHeader
        title={
          <span className="flex flex-col items-center gap-3">
            <AvatarCreatorModal
              onSaved={onAvatarSaved}
              trigger={
                <button type="button" className="group relative rounded-q-full" aria-label="Change your avatar">
                  <Avatar size="lg" src={displayAvatar} alt={user.name ?? "Player"} />
                  <span className="absolute inset-0 flex items-center justify-center rounded-q-full bg-q-transparent-dark-40 opacity-0 transition-opacity group-hover:opacity-100">
                    <Wand2 className="size-5 text-q-icon-inverse" aria-hidden />
                  </span>
                </button>
              }
            />
            {user.name ?? "Player"}
          </span>
        }
        description={`Level ${snapshot.level}`}
      />

      <Section>
        <Panel className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Typography as="span" variant="caption-sm-medium" color="secondary">
              {snapshot.xpInLevel} / 100 XP to next level
            </Typography>
            <Typography as="span" variant="caption-sm-medium" color="secondary">
              {snapshot.xp} total XP
            </Typography>
          </div>
          <Progress value={snapshot.xpInLevel} max={100} size="sm" />
        </Panel>
      </Section>

      <Section title="Stats">
        <div className="grid gap-4 sm:grid-cols-3">
          <MetricCard icon={Flame} label="Day streak" value={snapshot.streak} />
          <MetricCard icon={Gamepad2} label="Games played" value={snapshot.gamesPlayed} />
          <MetricCard icon={Sparkles} label="Total XP" value={snapshot.xp} />
        </div>
      </Section>

      <Section
        title="Badges"
        description={`${unlocked.length} / ${BADGES.length} earned`}
        actions={
          <Button variant="ghost" size="xs" onClick={onOpenBadges}>
            View all
          </Button>
        }
      >
        {unlocked.length === 0 ? (
          <Panel>
            <Typography as="p" variant="body-sm-regular" color="secondary">
              Play a game to start earning badges.
            </Typography>
          </Panel>
        ) : (
          <div className="flex flex-wrap gap-2">
            {unlocked.map((b) => (
              <span
                key={b.id}
                className="flex items-center gap-1.5 rounded-q-300 border border-q-border-subtle bg-q-background-secondary px-2.5 py-1.5"
                title={b.desc}
              >
                <span aria-hidden>{b.emoji}</span>
                <Typography as="span" variant="caption-sm-medium" color="primary">
                  {b.label}
                </Typography>
              </span>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Mystery Round gallery"
        description="Every mystery image from your games."
        actions={
          <Button variant="ghost" size="xs" onClick={onOpenMysteryGallery}>
            View all
          </Button>
        }
      >
        <Panel className="flex items-center gap-3">
          <Images className="size-5 text-q-icon-secondary" aria-hidden />
          <Typography as="span" variant="body-sm-regular" color="secondary">
            Browse what's been guessed so far.
          </Typography>
        </Panel>
      </Section>

      <Section title="History">
        <Panel className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Award className="size-5 text-q-icon-secondary" aria-hidden />
            <Typography as="span" variant="body-sm-regular" color="secondary">
              {snapshot.history.length} game{snapshot.history.length === 1 ? "" : "s"} recorded
            </Typography>
          </div>
          <Button variant="ghost" size="xs" onClick={onOpenHistory}>
            View all
          </Button>
        </Panel>
      </Section>

      <RemoveAdsSection active={snapshot.removeAdsActive} />

      <SettingsSection />

      <Section>
        <Button
          variant="tertiary"
          size="sm"
          start={<LogOut className="size-4" aria-hidden />}
          onClick={() => logoutRedirect()}
        >
          Sign out
        </Button>
      </Section>

      <DeleteAccountSection />
    </Page>
  );
}
