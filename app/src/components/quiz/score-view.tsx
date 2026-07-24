import { Award, Flame, Share2, Sparkles, Target } from "lucide-react";
import { Button } from "@higgsfield/quanta/button";
import { Typography } from "@higgsfield/quanta/typography";
import { MetricCard, Page, PageHeader, Section } from "@/components/custom-ui";
import { BADGES } from "@/lib/quiz/badges";
import { shareText } from "@/lib/quiz/share";
import type { GameMode } from "@/lib/quiz/types";

function shareTextForResult(mode: GameMode, correct: number, total: number, score: number, categoryLabel?: string): string {
  if (mode === "daily") return `I scored ${score}/100 on today's Quizora daily challenge! 🧠`;
  if (mode === "weekly") return `I scored ${score} points on this week's Quizora challenge! 🧠`;
  const label = categoryLabel ?? "free play";
  return `I got ${correct}/${total} in Quizora's ${label} round! 🧠`;
}

export function ScoreView({
  mode,
  correct,
  total,
  score,
  xpEarned,
  newLevel,
  streak,
  categoryLabel,
  newlyUnlockedBadgeIds,
  rejected,
  onDone,
}: {
  mode: GameMode;
  correct: number;
  total: number;
  score: number;
  xpEarned: number;
  newLevel: number;
  streak: number;
  categoryLabel?: string;
  newlyUnlockedBadgeIds: string[];
  rejected?: "daily-already-done" | "weekly-already-done";
  onDone: () => void;
}) {
  const unlockedBadges = BADGES.filter((b) => newlyUnlockedBadgeIds.includes(b.id));
  const isPerfect = total > 0 && correct === total;

  return (
    <Page>
      <PageHeader
        eyebrow={rejected ? "Already played" : isPerfect ? "Perfect score!" : "Nice run"}
        title={rejected ? "You've already done this one" : `${correct} / ${total} correct`}
        description={
          rejected
            ? mode === "daily"
              ? "Come back tomorrow for a fresh daily challenge."
              : "Come back next week for a fresh weekly challenge."
            : mode === "daily"
              ? `Score: ${score}/100`
              : `Score: ${score} pts`
        }
        actions={
          <>
            {!rejected ? (
              <Button
                variant="ghost"
                size="md"
                start={<Share2 className="size-4" aria-hidden />}
                onClick={() => shareText(shareTextForResult(mode, correct, total, score, categoryLabel))}
              >
                Share
              </Button>
            ) : null}
            <Button variant="secondary" size="md" onClick={onDone}>
              Continue
            </Button>
          </>
        }
      />

      {!rejected && (
        <Section title="Rewards">
          <div className="grid gap-4 sm:grid-cols-3">
            <MetricCard icon={Sparkles} label="XP earned" value={`+${xpEarned}`} />
            <MetricCard icon={Award} label="Level" value={newLevel} />
            <MetricCard icon={Flame} label="Streak" value={streak} />
          </div>
        </Section>
      )}

      {unlockedBadges.length > 0 ? (
        <Section title="New badges" description="Unlocked just now.">
          <div className="flex flex-wrap gap-3">
            {unlockedBadges.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-2 rounded-q-400 border border-q-border-subtle bg-q-background-secondary px-3 py-2"
              >
                <span className="text-xl" aria-hidden>
                  {b.emoji}
                </span>
                <Typography as="span" variant="body-sm-medium" color="primary">
                  {b.label}
                </Typography>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {!rejected && total > 0 && (
        <Section>
          <div className="flex items-center justify-center gap-2 text-q-text-tertiary">
            <Target className="size-4" aria-hidden />
            <Typography as="span" variant="caption-sm-regular" color="tertiary">
              {isPerfect ? "Perfect score — nothing missed." : `${total - correct} missed this round.`}
            </Typography>
          </div>
        </Section>
      )}

    </Page>
  );
}
