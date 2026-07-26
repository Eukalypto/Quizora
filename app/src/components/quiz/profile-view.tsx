import { useEffect, useState } from "react";
import { Award, Flame, Gamepad2, LogOut, Music, Sparkles, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@higgsfield/quanta/avatar";
import { Button } from "@higgsfield/quanta/button";
import { Progress } from "@higgsfield/quanta/progress";
import { Typography } from "@higgsfield/quanta/typography";
import { MetricCard, Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import { logoutRedirect, type CurrentUser } from "@/hooks/use-current-user";
import { BADGES } from "@/lib/quiz/badges";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted } from "@/lib/quiz/sound";
import type { UserSnapshot } from "@/lib/quiz/types";

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

export function ProfileView({
  user,
  snapshot,
  onOpenBadges,
  onOpenHistory,
}: {
  user: CurrentUser;
  snapshot: UserSnapshot;
  onOpenBadges: () => void;
  onOpenHistory: () => void;
}) {
  const unlocked = BADGES.filter((b) => snapshot.unlockedBadgeIds.includes(b.id));
  const displayAvatar = snapshot.avatarUrl ?? (user.avatar_url as string | undefined);

  return (
    <Page>
      <PageHeader
        title={
          <span className="flex flex-col items-center gap-3">
            <Avatar size="lg" src={displayAvatar} alt={user.name ?? "Player"} />
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
    </Page>
  );
}
