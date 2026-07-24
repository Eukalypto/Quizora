import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@higgsfield/quanta/button";
import { Media } from "@higgsfield/quanta/media";
import { Progress } from "@higgsfield/quanta/progress";
import { Typography } from "@higgsfield/quanta/typography";
import type { Question } from "@/lib/categories";
import type { GameMode } from "@/lib/quiz/types";
import { normalizedScore, timerSecondsFor } from "@/lib/quiz/scoring";
import { playCorrectSound, playWrongSound } from "@/lib/quiz/sound";
import { cn } from "@/lib/utils";

export interface GameResult {
  mode: GameMode;
  categoryLabel?: string;
  correct: number;
  total: number;
  timeBonusTotal: number;
  questionIds: number[];
  score: number;
}

export function GameSession({
  mode,
  questions,
  categoryLabel,
  onComplete,
  onExit,
}: {
  mode: GameMode;
  questions: Question[];
  categoryLabel?: string;
  onComplete: (result: GameResult) => void;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeBonusTotal, setTimeBonusTotal] = useState(0);
  const question = questions[index];
  const totalSeconds = timerSecondsFor(mode, question.level);
  const [timeLeft, setTimeLeft] = useState(totalSeconds);
  const answered = selected !== null;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setTimeLeft(totalSeconds);
    setSelected(null);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (timeLeft === 0 && selected === null) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setSelected(-1);
      playWrongSound();
      window.setTimeout(() => {
        if (index + 1 < questions.length) {
          setIndex(index + 1);
        } else {
          finish(correctCount, timeBonusTotal);
        }
      }, 1400);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, selected]);

  const finish = (finalCorrect: number, finalBonus: number) => {
    onComplete({
      mode,
      categoryLabel,
      correct: finalCorrect,
      total: questions.length,
      timeBonusTotal: finalBonus,
      questionIds: questions.map((q) => q.id),
      score: mode === "daily" ? normalizedScore(finalCorrect, questions.length) : finalCorrect * 10 + finalBonus,
    });
  };

  const handleSelect = (answerIndex: number) => {
    if (answered) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    const isCorrect = answerIndex === question.correct;
    setSelected(answerIndex);
    if (isCorrect) playCorrectSound();
    else playWrongSound();
    const bonus = isCorrect ? timeLeft : 0;
    const nextCorrect = correctCount + (isCorrect ? 1 : 0);
    const nextBonus = timeBonusTotal + bonus;
    setCorrectCount(nextCorrect);
    setTimeBonusTotal(nextBonus);

    window.setTimeout(() => {
      if (index + 1 < questions.length) {
        setIndex(index + 1);
      } else {
        finish(nextCorrect, nextBonus);
      }
    }, 1400);
  };

  const progressPct = useMemo(() => Math.round(((index + 1) / questions.length) * 100), [index, questions.length]);
  const timerLow = timeLeft <= 5;

  return (
    <div className="mx-auto flex h-full w-full max-w-2xl min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6">
      <div className="flex items-center justify-between gap-3">
        <Button variant="ghost" size="xs" onClick={onExit}>
          Exit
        </Button>
        <Typography as="span" variant="caption-sm-medium" color="secondary">
          Question {index + 1} / {questions.length}
        </Typography>
        <Typography
          as="span"
          variant="label-sm-semi-bold"
          color={timerLow ? "danger" : "primary"}
          className={cn("tabular-nums", timerLow && "animate-pulse")}
        >
          {timeLeft}s
        </Typography>
      </div>

      <Progress value={progressPct} size="xs" />

      {question.media_url ? (
        <Media.Root ratio="wide" rounded="lg" className="w-full">
          <Media.Image src={question.media_url} alt="" fit="cover" />
        </Media.Root>
      ) : null}

      <Typography as="h2" variant="title-md-semi-bold" color="primary" className="text-balance">
        {question.question}
      </Typography>

      <div className="grid gap-3 sm:grid-cols-2">
        {question.answers.map((answer, i) => {
          const isSelected = selected === i;
          const isCorrectAnswer = i === question.correct;
          const showState = answered;
          return (
            <button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => handleSelect(i)}
              className={cn(
                "rounded-q-400 border px-4 py-3 text-left text-q-body-md-regular transition-colors",
                !showState && "border-q-border-default bg-q-background-secondary hover:bg-q-background-tertiary",
                showState && isCorrectAnswer && "border-q-border-success bg-q-state-success-subtle text-q-text-success",
                showState && isSelected && !isCorrectAnswer && "border-q-border-error bg-q-state-error-subtle text-q-text-danger",
                showState && !isSelected && !isCorrectAnswer && "border-q-border-subtle bg-q-background-secondary opacity-60",
              )}
            >
              {answer}
            </button>
          );
        })}
      </div>
    </div>
  );
}
