import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@higgsfield/quanta/button";
import { Loader } from "@higgsfield/quanta/loader";
import { Media } from "@higgsfield/quanta/media";
import { Modal } from "@higgsfield/quanta/modal";
import { Progress } from "@higgsfield/quanta/progress";
import { toast } from "@higgsfield/quanta/sonner";
import { Typography } from "@higgsfield/quanta/typography";
import { drawMysteryQuestion, getMysteryDailyStatus } from "@/lib/api/mystery.functions";
import {
  MYSTERY_CATEGORY_EMOJI,
  MYSTERY_CATEGORY_LABEL,
  nextMysteryState,
  POINTS_BY_LEVEL,
  REVEAL_BONUS_BY_LEVEL,
  REVEAL_DURATION_SECONDS,
  type MysteryCategory,
  type MysteryStreakState,
} from "@/lib/quiz/mystery";
import { playCorrectSound, playLevelUpSound, playWrongSound } from "@/lib/quiz/sound";
import { cn } from "@/lib/utils";
import type { GameResult } from "@/components/quiz/game-session";

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
const MAX_BLUR_PX = 24;

// Curated images are an instant DB draw, not a generation wait — "loading" is
// reused for both the first question and every "Next" (no separate
// confirm/generating phases like the old AI-generation flow needed).
type Phase = "loading" | "gated" | "empty" | "answering" | "result";

interface CurrentQuestion {
  subjectId: string;
  level: 1 | 2 | 3;
  category: MysteryCategory;
  mediaUrl: string;
  options: string[];
  correctIndex: number;
}

export function MysteryRoundView({
  onComplete,
  onExit,
}: {
  onComplete: (result: GameResult) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [dailyLimit, setDailyLimit] = useState<number | null>(null);
  const [streakState, setStreakState] = useState<MysteryStreakState>({ level: 1, correctStreak: 0, wrongStreak: 0 });
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [question, setQuestion] = useState<CurrentQuestion | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [lastCorrect, setLastCorrect] = useState(false);
  const [lastPoints, setLastPoints] = useState<number | null>(null);
  const [lastBonus, setLastBonus] = useState(0);
  const [justLeveledUp, setJustLeveledUp] = useState<1 | 2 | 3 | null>(null);
  const [tally, setTally] = useState({ correct: 0, total: 0, score: 0 });
  const [revealSeconds, setRevealSeconds] = useState(0);
  const revealIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
    };
  }, []);

  const fetchQuestion = async (level: 1 | 2 | 3, excludeIds: string[]) => {
    setPhase("loading");
    try {
      const result = await drawMysteryQuestion({ data: { level, excludeIds } });
      if (!result.ok) {
        if (result.errorCode === "daily_limit_reached") {
          setRemaining(0);
          setPhase("gated");
          return;
        }
        setPhase("empty");
        return;
      }
      setQuestion({
        subjectId: result.subjectId,
        level: result.level,
        category: result.category,
        mediaUrl: result.mediaUrl,
        options: result.options,
        correctIndex: result.correctIndex,
      });
      setSelected(null);
      setJustLeveledUp(null);
      setRemaining((prev) => (prev != null ? Math.max(0, prev - 1) : prev));
      setPhase("answering");

      // Progressive reveal: the image starts fully blurred and sharpens over
      // REVEAL_DURATION_SECONDS — guessing correctly before it's fully
      // revealed earns a bonus, computed from revealSeconds at answer time.
      setRevealSeconds(0);
      if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
      revealIntervalRef.current = setInterval(() => {
        setRevealSeconds((s) => {
          if (s >= REVEAL_DURATION_SECONDS) {
            if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
            return s;
          }
          return s + 1;
        });
      }, 1000);
    } catch {
      toast.error("Couldn't load the mystery image", { description: "Check your connection and try again." });
      setPhase("empty");
    }
  };

  useEffect(() => {
    getMysteryDailyStatus()
      .then((status) => {
        setRemaining(status.remaining);
        setDailyLimit(status.limit);
        if (status.remaining <= 0) {
          setPhase("gated");
          return;
        }
        fetchQuestion(1, []);
      })
      .catch(() => fetchQuestion(1, []));
  }, []);

  const answer = (index: number) => {
    if (!question || phase !== "answering") return;
    if (revealIntervalRef.current) clearInterval(revealIntervalRef.current);
    setSelected(index);
    const correct = index === question.correctIndex;
    const revealFraction = Math.min(1, revealSeconds / REVEAL_DURATION_SECONDS);
    const bonus = correct ? Math.round(REVEAL_BONUS_BY_LEVEL[question.level] * (1 - revealFraction)) : 0;
    const points = correct ? POINTS_BY_LEVEL[question.level] + bonus : 0;
    setLastCorrect(correct);
    setLastPoints(points);
    setLastBonus(bonus);
    setTally((prev) => ({
      correct: prev.correct + (correct ? 1 : 0),
      total: prev.total + 1,
      score: prev.score + points,
    }));

    const nextState = nextMysteryState(streakState, correct);
    setStreakState(nextState);
    if (correct && nextState.level > streakState.level) {
      setJustLeveledUp(nextState.level);
      playLevelUpSound();
    } else if (correct) {
      playCorrectSound();
    } else {
      playWrongSound();
    }

    setSeenIds((prev) => [...prev, question.subjectId]);
    setPhase("result");
  };

  const next = () => {
    if (remaining != null && remaining <= 0) {
      setPhase("gated");
      return;
    }
    fetchQuestion(streakState.level, seenIds);
  };

  const endRound = () => {
    onComplete({
      mode: "freeplay",
      categoryLabel: "Mystery Round",
      correct: tally.correct,
      total: tally.total,
      timeBonusTotal: 0,
      questionIds: [],
      score: tally.score,
    });
  };

  if (phase === "loading" && !question) {
    return (
      <div className="grid h-full place-items-center">
        <Loader variant="stars" size="lg" />
      </div>
    );
  }

  if (phase === "empty") {
    const played = tally.total > 0;
    return (
      <Modal.Root open onOpenChange={(open) => !open && (played ? endRound() : onExit())}>
        <Modal.Content size="sm">
          <Modal.Header>
            <Modal.Title>No mystery images yet</Modal.Title>
            <Modal.CloseButton onClick={() => (played ? endRound() : onExit())} />
          </Modal.Header>
          <Modal.Body>
            <Typography as="p" variant="body-sm-regular" color="secondary">
              We're still curating images for this round — check back soon.
            </Typography>
          </Modal.Body>
          <Modal.Footer>
            <Modal.FooterActions>
              <Button variant="secondary" size="sm" onClick={() => (played ? endRound() : onExit())}>
                {played ? "See results" : "Back"}
              </Button>
            </Modal.FooterActions>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    );
  }

  if (phase === "gated") {
    const played = tally.total > 0;
    return (
      <Modal.Root open onOpenChange={(open) => !open && (played ? endRound() : onExit())}>
        <Modal.Content size="sm">
          <Modal.Header>
            <Modal.Title>Daily limit reached</Modal.Title>
            <Modal.CloseButton onClick={() => (played ? endRound() : onExit())} />
          </Modal.Header>
          <Modal.Body>
            <Typography as="p" variant="body-sm-regular" color="secondary">
              You've played {dailyLimit ?? 7} Mystery Round questions today — come back tomorrow for {dailyLimit ?? 7} more.
            </Typography>
          </Modal.Body>
          <Modal.Footer>
            <Modal.FooterActions>
              <Button variant="secondary" size="sm" onClick={() => (played ? endRound() : onExit())}>
                {played ? "See results" : "Back"}
              </Button>
            </Modal.FooterActions>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between">
        <Typography as="span" variant="caption-sm-medium" color="secondary">
          {LEVEL_LABEL[streakState.level]} · {tally.correct}/{tally.total} correct
        </Typography>
        <Button variant="ghost" size="xs" onClick={endRound}>
          End round
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-q-400 border border-q-border-subtle bg-q-background-secondary px-4 py-2.5">
        <div className="flex flex-col">
          <Typography as="span" variant="caption-xs-medium" color="tertiary">
            Total score
          </Typography>
          <Typography as="span" variant="title-sm-semi-bold" color="primary">
            {tally.score} pts
          </Typography>
        </div>
        <div className="flex flex-col items-end">
          <Typography as="span" variant="caption-xs-medium" color="tertiary">
            Last question
          </Typography>
          <Typography
            as="span"
            variant="title-sm-semi-bold"
            color={lastPoints == null ? "tertiary" : lastPoints > 0 ? "success" : "danger"}
          >
            {lastPoints == null ? "—" : lastPoints > 0 ? `+${lastPoints}` : "+0"}
          </Typography>
        </div>
      </div>

      {phase === "loading" ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
          <Loader variant="stars" size="lg" />
        </div>
      ) : question ? (
        <>
          {(() => {
            const blurPx = phase === "answering" ? Math.round(MAX_BLUR_PX * (1 - Math.min(1, revealSeconds / REVEAL_DURATION_SECONDS))) : 0;
            return (
              <Media.Root ratio="square" rounded="lg" className="w-full">
                <Media.Image
                  src={question.mediaUrl}
                  alt="Mystery"
                  fit="cover"
                  style={{ filter: `blur(${blurPx}px)`, transition: "filter 1s linear" }}
                />
              </Media.Root>
            );
          })()}

          {phase === "answering" && revealSeconds < REVEAL_DURATION_SECONDS ? (
            <div className="flex flex-col gap-1.5">
              <Progress value={(revealSeconds / REVEAL_DURATION_SECONDS) * 100} size="xs" />
              <Typography as="span" variant="caption-xs-regular" color="tertiary">
                Still coming into focus — guess now for a +{REVEAL_BONUS_BY_LEVEL[question.level]} quick-guess bonus.
              </Typography>
            </div>
          ) : null}

          <div className="flex items-center gap-1.5 self-start rounded-q-full border border-q-border-subtle bg-q-background-secondary px-3 py-1">
            <Typography as="span" variant="caption-xs-medium" color="secondary">
              {MYSTERY_CATEGORY_EMOJI[question.category]} {MYSTERY_CATEGORY_LABEL[question.category]}
            </Typography>
          </div>

          <Typography as="h2" variant="title-sm-semi-bold" color="primary">
            What is this?
          </Typography>

          <div className="grid gap-3 sm:grid-cols-2">
            {question.options.map((option, i) => {
              const isSelected = selected === i;
              const isCorrectAnswer = i === question.correctIndex;
              const showState = phase === "result";
              return (
                <button
                  key={i}
                  type="button"
                  disabled={phase !== "answering"}
                  onClick={() => answer(i)}
                  className={cn(
                    "rounded-q-400 border px-4 py-3 text-left text-q-body-md-regular transition-colors",
                    !showState && "border-q-border-default bg-q-background-secondary hover:bg-q-background-tertiary",
                    showState && isCorrectAnswer && "border-q-border-success bg-q-state-success-subtle text-q-text-success",
                    showState && isSelected && !isCorrectAnswer && "border-q-border-error bg-q-state-error-subtle text-q-text-danger",
                    showState && !isSelected && !isCorrectAnswer && "border-q-border-subtle bg-q-background-secondary opacity-60",
                  )}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {phase === "result" ? (
            <div className="flex flex-col gap-3">
              {justLeveledUp ? (
                <div className="flex animate-bounce items-center gap-2 rounded-q-400 border border-q-border-warning bg-q-state-warning-subtle px-4 py-3">
                  <TrendingUp className="size-5 shrink-0 text-q-icon-warning" aria-hidden />
                  <Typography as="span" variant="label-sm-semi-bold" color="warning">
                    Level up! Now playing {LEVEL_LABEL[justLeveledUp]}
                  </Typography>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3">
                <Typography as="span" variant="label-sm-semi-bold" color={lastCorrect ? "success" : "danger"}>
                  {lastCorrect
                    ? lastBonus > 0
                      ? `Correct! +${lastPoints} pts (+${lastBonus} quick-guess bonus)`
                      : `Correct! +${lastPoints} pts`
                    : "Wrong"}
                </Typography>
                <Button variant="primary" size="md" onClick={next}>
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
