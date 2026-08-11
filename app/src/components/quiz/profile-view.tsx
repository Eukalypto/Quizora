import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Award, Flame, Gamepad2, Images, LogOut, Music, RotateCcw, ShieldCheck, ShieldOff, Sparkles, Trash2, Volume2, VolumeX, Wand2 } from "lucide-react";
import type { PurchasesPackage } from "@revenuecat/purchases-capacitor";
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
import { syncMyEntitlements } from "@/lib/api/purchases.functions";
import { isNativeShell, withOrigin } from "@/lib/native-shell";
import { useRevenueCatReady } from "@/lib/purchases-native";
import { BADGES } from "@/lib/quiz/badges";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted } from "@/lib/quiz/sound";
import type { UserSnapshot } from "@/lib/quiz/types";

// Remove Ads purchase flow — native shell only (StoreKit/Play Billing don't
// exist on web, and there's no web purchase path per the agreed
// Monetization v1 plan, no Stripe). `isNative` defaults to false and only
// flips true inside an effect (never during the initial render) so the
// prerendered mobile-shell HTML — built on Node, which has no
// window.Capacitor — always matches the first client render; flipping it
// synchronously would cause a hydration mismatch the one time this actually
// runs inside the real native app.
function RemoveAdsSection({ active }: { active: boolean }) {
  const [isNative, setIsNative] = useState(false);
  useEffect(() => {
    setIsNative(isNativeShell());
  }, []);

  if (!isNative) {
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

  return <RemoveAdsSectionNative active={active} />;
}

function RemoveAdsSectionNative({ active }: { active: boolean }) {
  const queryClient = useQueryClient();
  const ready = useRevenueCatReady();
  const [packages, setPackages] = useState<{ monthly: PurchasesPackage | null; annual: PurchasesPackage | null; lifetime: PurchasesPackage | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ready || active) return;
    let cancelled = false;
    void (async () => {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const offerings = await Purchases.getOfferings().catch(() => null);
      const current = offerings?.current;
      if (!cancelled && current) {
        setPackages({ monthly: current.monthly, annual: current.annual, lifetime: current.lifetime });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, active]);

  const refreshSnapshot = () => queryClient.invalidateQueries({ queryKey: ["quiz-snapshot"] });

  // The local optimistic flip (from the SDK's own fresh CustomerInfo) is
  // what makes the UI feel instant; syncMyEntitlements is what makes it
  // durable — it's the D1 write that survives a reload, and (for restores
  // specifically) the only path guaranteed to run at all, since a restore
  // doesn't always produce a new RevenueCat webhook event.
  const syncAfterLocalSuccess = async () => {
    try {
      await syncMyEntitlements();
    } catch {
      // D1 sync failed (e.g. RevenueCat secrets not configured on the Worker
      // yet) — the purchase itself still succeeded and the webhook will
      // eventually reconcile it; don't block or scare the user over this.
    }
    refreshSnapshot();
  };

  const handlePurchase = async (pkg: PurchasesPackage | null) => {
    if (!pkg || busy) return;
    setBusy(true);
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      await Purchases.purchasePackage({ aPackage: pkg });
      toast.success("You're ad-free!", { description: "Thanks for supporting Quizora." });
      await syncAfterLocalSuccess();
    } catch (error) {
      const userCancelled = (error as { userCancelled?: boolean } | null)?.userCancelled;
      if (!userCancelled) {
        toast.error("Purchase didn't go through", { description: "Check your connection and try again." });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const { customerInfo } = await Purchases.restorePurchases();
      await syncAfterLocalSuccess();
      if (customerInfo.entitlements.active["remove_ads"]) {
        toast.success("Purchases restored");
      } else {
        toast.info("Nothing to restore", { description: "No previous Remove Ads purchase found on this account." });
      }
    } catch {
      toast.error("Couldn't restore purchases", { description: "Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  };

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
          <Button variant="secondary" size="xs" disabled={!ready || busy || !packages?.monthly} onClick={() => void handlePurchase(packages?.monthly ?? null)}>
            Monthly
          </Button>
          <Button variant="secondary" size="xs" disabled={!ready || busy || !packages?.annual} onClick={() => void handlePurchase(packages?.annual ?? null)}>
            Yearly
          </Button>
          <Button variant="primary" size="xs" disabled={!ready || busy || !packages?.lifetime} onClick={() => void handlePurchase(packages?.lifetime ?? null)}>
            Lifetime
          </Button>
        </div>
        <Button variant="tertiary" size="xs" disabled={!ready || busy} onClick={() => void handleRestore()} start={<RotateCcw className="size-3.5" aria-hidden />}>
          Restore Purchases
        </Button>
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
