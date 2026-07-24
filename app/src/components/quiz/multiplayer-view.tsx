import { useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus, Share2, Trophy } from "lucide-react";
import { Button } from "@higgsfield/quanta/button";
import { Input } from "@higgsfield/quanta/input";
import { Progress } from "@higgsfield/quanta/progress";
import { Tabs } from "@higgsfield/quanta/tabs";
import { toast } from "@higgsfield/quanta/sonner";
import { Typography } from "@higgsfield/quanta/typography";
import { Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import { AdSlot } from "@/components/quiz/ad-slot";
import { CategoryPicker, DifficultyTabs } from "@/components/quiz/category-picker";
import type { Difficulty, Question } from "@/lib/categories";
import { ALL_CATEGORIES } from "@/lib/category-list";
import { startMultiplayerRound } from "@/lib/api/quiz.functions";
import { shareText } from "@/lib/quiz/share";
import { playCorrectSound, playWrongSound } from "@/lib/quiz/sound";

const QUESTIONS_PER_ROUND = 10;
const TOTAL_ROUNDS_OPTIONS = [1, 2, 3] as const;
const MIN_PICK = 3;
const MAX_PICK = 6;
const ANSWER_SECONDS = 30;
const MCQ_SECONDS = 15;
const NAME_MAX_LENGTH = 10;

function nameError(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return "Enter a name";
  if (trimmed.length > NAME_MAX_LENGTH) return `Max ${NAME_MAX_LENGTH} characters`;
  if (!/^[a-zA-Z0-9]+$/.test(trimmed)) return "Letters and numbers only";
  return null;
}

export type MultiplayerVariant = "duo" | "teams";

const DEFAULT_TEAMS: Record<MultiplayerVariant, string[]> = {
  duo: ["Player1", "Player2"],
  teams: ["Team1", "Team2"],
};

interface TeamScore {
  score: number;
  correct: number;
  mcqUsed: number;
}

/** Every question's own micro state machine — explicit states instead of
 * ad-hoc booleans, per the brief: question_shown (no timer) -> [Start Timer]
 * -> answering (30s) -> judged/time_up -> result; or -> mcq_answering
 * (fresh 15s) -> result. */
type QuestionState = "question_shown" | "answering" | "mcq_answering" | "time_up" | "result";

interface JudgeOutcome {
  correct: boolean;
  viaMcq: boolean;
  timedOut: boolean;
}

type MatchPhase = "setup" | "picking" | "handoff" | "play" | "round-break" | "results";

export function MultiplayerView({ variant, onExit }: { variant: MultiplayerVariant; onExit: () => void }) {
  const [phase, setPhase] = useState<MatchPhase>("setup");
  const [teams, setTeams] = useState<string[]>(DEFAULT_TEAMS[variant]);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
  const [totalRounds, setTotalRounds] = useState<number>(1);
  const [scores, setScores] = useState<TeamScore[]>([]);

  const [currentRound, setCurrentRound] = useState(0);
  const [pickerIndex, setPickerIndex] = useState(0);
  const [pickedCategoryKeys, setPickedCategoryKeys] = useState<string[]>([]);
  const [categoriesByTeam, setCategoriesByTeam] = useState<string[][]>([]);
  const [roundQuestionSets, setRoundQuestionSets] = useState<Question[][]>([]);
  const [isBuildingRound, setIsBuildingRound] = useState(false);

  const [currentTeam, setCurrentTeam] = useState(0);
  const [currentQ, setCurrentQ] = useState(0);
  const [questionState, setQuestionState] = useState<QuestionState>("question_shown");
  const [judgeOutcome, setJudgeOutcome] = useState<JudgeOutcome | null>(null);
  const [mcqShuffled, setMcqShuffled] = useState<{ text: string; correct: boolean }[]>([]);
  const [timeLeft, setTimeLeft] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isDuo = variant === "duo";
  const addTeam = () => teams.length < 6 && setTeams([...teams, `Team${teams.length + 1}`]);
  const removeTeam = () => teams.length > 2 && setTeams(teams.slice(0, -1));

  const teamNameErrors = teams.map(nameError);
  const hasNameError = teamNameErrors.some((e) => e !== null);

  const startMatch = () => {
    if (hasNameError) return;
    setScores(teams.map(() => ({ score: 0, correct: 0, mcqUsed: 0 })));
    setCurrentRound(0);
    beginRoundPicking();
  };

  const beginRoundPicking = () => {
    setCategoriesByTeam(teams.map(() => []));
    setPickerIndex(0);
    setPickedCategoryKeys([]);
    setPhase("picking");
  };

  const targetOfPicker = (picker: number) => (picker + 1) % teams.length;

  const confirmPick = async () => {
    const target = targetOfPicker(pickerIndex);
    const next = [...categoriesByTeam];
    next[target] = pickedCategoryKeys;
    setCategoriesByTeam(next);

    if (pickerIndex + 1 < teams.length) {
      setPickerIndex(pickerIndex + 1);
      setPickedCategoryKeys([]);
      return;
    }

    // Every team has categories assigned — ask the server to build this
    // round's question sets (question content never ships to the client
    // outside of the picks actually selected for a match).
    setIsBuildingRound(true);
    try {
      const teamCategoryTags = next.map((keys) => ALL_CATEGORIES.filter((c) => keys.includes(c.key)).map((c) => c.tags));
      const sets = await startMultiplayerRound({ data: { teamCategoryTags, difficulty, count: QUESTIONS_PER_ROUND } });
      if (sets.some((s) => s.length === 0)) {
        toast.warning("No questions available", {
          description: "One of the picked category + difficulty combinations has nothing to play. Try different categories.",
        });
        return;
      }
      setRoundQuestionSets(sets);
      setCurrentTeam(0);
      setCurrentQ(0);
      setPhase("handoff");
    } catch {
      toast.error("Couldn't start the round", { description: "Check your connection and try again." });
    } finally {
      setIsBuildingRound(false);
    }
  };

  const question = roundQuestionSets[currentTeam]?.[currentQ];

  useEffect(() => {
    setQuestionState("question_shown");
    setJudgeOutcome(null);
    setMcqShuffled([]);
    setTimeLeft(0);
    if (intervalRef.current) clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentTeam, currentQ]);

  const startTimer = (seconds: number) => {
    setTimeLeft(seconds);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if ((questionState === "answering" || questionState === "mcq_answering") && timeLeft === 0) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setQuestionState("time_up");
      const timedOutViaMcq = questionState === "mcq_answering";
      playWrongSound();
      window.setTimeout(() => {
        setJudgeOutcome({ correct: false, viaMcq: timedOutViaMcq, timedOut: true });
        setQuestionState("result");
        recordOutcome(false, timedOutViaMcq);
      }, 900);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, questionState]);

  const recordOutcome = (correct: boolean, viaMcq: boolean) => {
    setScores((prev) => {
      const next = [...prev];
      const points = correct ? (viaMcq ? 5 : 10) : 0;
      next[currentTeam] = {
        score: next[currentTeam].score + points,
        correct: next[currentTeam].correct + (correct ? 1 : 0),
        mcqUsed: next[currentTeam].mcqUsed + (viaMcq ? 1 : 0),
      };
      return next;
    });
  };

  const beginAnswering = () => {
    setQuestionState("answering");
    startTimer(ANSWER_SECONDS);
  };

  const requestMcq = () => {
    if (!question) return;
    const wrongAnswers = question.answers.filter((_, i) => i !== question.correct);
    const options = [
      { text: question.answers[question.correct], correct: true },
      ...wrongAnswers.map((text) => ({ text, correct: false })),
    ].sort(() => Math.random() - 0.5);
    setMcqShuffled(options);
    setQuestionState("mcq_answering");
    startTimer(MCQ_SECONDS);
  };

  const judge = (correct: boolean, viaMcq = false) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (correct) playCorrectSound();
    else playWrongSound();
    setJudgeOutcome({ correct, viaMcq, timedOut: false });
    setQuestionState("result");
    recordOutcome(correct, viaMcq);
  };

  const advance = () => {
    const teamSet = roundQuestionSets[currentTeam] ?? [];
    const isLastQ = currentQ + 1 >= teamSet.length;
    const isLastTeam = currentTeam + 1 >= teams.length;
    if (!isLastQ) {
      setCurrentQ(currentQ + 1);
      return;
    }
    if (!isLastTeam) {
      setCurrentTeam(currentTeam + 1);
      setCurrentQ(0);
      setPhase("handoff");
      return;
    }
    // Round complete.
    if (currentRound + 1 < totalRounds) {
      setPhase("round-break");
      return;
    }
    setPhase("results");
  };

  const startNextRound = () => {
    setCurrentRound(currentRound + 1);
    beginRoundPicking();
  };

  // ---------- Setup ----------
  if (phase === "setup") {
    return (
      <Page>
        <PageHeader
          eyebrow={isDuo ? "Live Play · Duo" : "Live Play · Teams"}
          title={isDuo ? "Set up your duel" : "Set up your match"}
          description="Same device, pass and play. Your opponent picks your categories each round."
        />
        <Section title={isDuo ? "Players" : "Teams"}>
          <Panel className="flex flex-col gap-3">
            {teams.map((name, i) => (
              <Input
                key={i}
                label={isDuo ? `Player ${i + 1}` : `Team ${i + 1}`}
                value={name}
                maxLength={NAME_MAX_LENGTH}
                error={teamNameErrors[i] ?? undefined}
                onChange={(e) => setTeams(teams.map((t, ti) => (ti === i ? e.target.value : t)))}
              />
            ))}
            {!isDuo ? (
              <div className="flex gap-2">
                <Button variant="ghost" size="xs" start={<Plus className="size-4" aria-hidden />} disabled={teams.length >= 6} onClick={addTeam}>
                  Add team
                </Button>
                <Button variant="ghost" size="xs" start={<Minus className="size-4" aria-hidden />} disabled={teams.length <= 2} onClick={removeTeam}>
                  Remove team
                </Button>
              </div>
            ) : null}
          </Panel>
        </Section>

        <Section title="Difficulty">
          <DifficultyTabs value={difficulty} onChange={setDifficulty} />
        </Section>

        <Section title="Rounds" description="Each round is 10 questions.">
          <Tabs.Root variant="segmented" value={String(totalRounds)} onValueChange={(v) => setTotalRounds(Number(v))}>
            <Tabs.List>
              {TOTAL_ROUNDS_OPTIONS.map((n) => (
                <Tabs.Tab key={n} value={String(n)}>
                  {n}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Tabs.Root>
        </Section>

        <Section>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onExit}>
              Cancel
            </Button>
            <Button variant="primary" size="md" disabled={hasNameError} onClick={startMatch}>
              Start match
            </Button>
          </div>
        </Section>
      </Page>
    );
  }

  // ---------- Category picking (opponent picks for the next team) ----------
  if (phase === "picking") {
    const pickerName = teams[pickerIndex];
    const targetName = teams[targetOfPicker(pickerIndex)];
    const atMax = pickedCategoryKeys.length >= MAX_PICK;
    const canConfirm = pickedCategoryKeys.length >= MIN_PICK;
    return (
      <Page>
        <PageHeader
          eyebrow={`Round ${currentRound + 1}`}
          title={`${pickerName}, pick categories for ${targetName}`}
          description={`Choose ${MIN_PICK}-${MAX_PICK} categories — ${targetName} will answer questions only from these.`}
        />
        <Section>
          <CategoryPicker
            categories={ALL_CATEGORIES}
            selectedKeys={pickedCategoryKeys}
            multiple
            maxSelected={MAX_PICK}
            onToggle={(key) =>
              setPickedCategoryKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : atMax ? prev : [...prev, key]))
            }
          />
        </Section>
        <Section>
          <div className="flex items-center justify-between gap-3">
            <Typography as="span" variant="caption-sm-regular" color="tertiary">
              {pickedCategoryKeys.length} / {MAX_PICK} selected
            </Typography>
            <Button variant="primary" size="md" disabled={!canConfirm || isBuildingRound} onClick={confirmPick}>
              {isBuildingRound
                ? "Starting…"
                : !canConfirm
                  ? "Pick categories"
                  : pickerIndex + 1 < teams.length
                    ? "Confirm & next picker"
                    : "Confirm & start round"}
            </Button>
          </div>
        </Section>
      </Page>
    );
  }

  // ---------- Handoff ----------
  if (phase === "handoff") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 p-6 text-center">
        <Typography as="span" variant="caption-sm-medium" color="tertiary">
          Round {currentRound + 1} · Now playing
        </Typography>
        <Typography as="h1" variant="headline-md-semi-bold" color="primary">
          {teams[currentTeam]}
        </Typography>
        <Typography as="p" variant="body-sm-regular" color="secondary" className="max-w-sm">
          Everyone else reads the question and correct answer aloud (shown on screen). {teams[currentTeam]} answers
          without looking. Tap "Start timer" only once they're ready to answer.
        </Typography>
        <Button variant="primary" size="lg" onClick={() => setPhase("play")}>
          We're ready
        </Button>
      </div>
    );
  }

  // ---------- Play (per-question state machine) ----------
  if (phase === "play" && question) {
    const seconds = questionState === "mcq_answering" ? MCQ_SECONDS : ANSWER_SECONDS;
    const timerLow = timeLeft <= 5;
    const showTimer = questionState === "answering" || questionState === "mcq_answering";

    return (
      <div className="mx-auto flex h-full w-full max-w-2xl min-h-0 flex-col gap-4 overflow-y-auto p-4 md:p-6">
        <div className="flex items-center justify-between">
          <Typography as="span" variant="caption-sm-medium" color="secondary">
            {teams[currentTeam]} · Q{currentQ + 1}/{roundQuestionSets[currentTeam].length}
          </Typography>
          {showTimer ? (
            <Typography as="span" variant="label-sm-semi-bold" color={timerLow ? "danger" : "primary"} className="tabular-nums">
              {timeLeft}s
            </Typography>
          ) : null}
        </div>
        {showTimer ? <Progress value={(timeLeft / seconds) * 100} size="xs" /> : null}

        <Panel className="flex flex-col gap-2 border-q-border-success bg-q-state-success-subtle">
          <Typography as="span" variant="caption-xs-semi-bold" color="success">
            Correct answer (reader only — don't show the answering team)
          </Typography>
          <Typography as="span" variant="body-md-medium" color="primary">
            {question.answers[question.correct]}
          </Typography>
        </Panel>

        <Typography as="h2" variant="title-md-semi-bold" color="primary">
          {question.question}
        </Typography>

        {questionState === "question_shown" ? (
          <Button variant="primary" size="lg" onClick={beginAnswering}>
            Start timer
          </Button>
        ) : questionState === "answering" ? (
          <div className="flex flex-col gap-3">
            <Button variant="tertiary" size="sm" onClick={requestMcq}>
              Show multiple choice (half credit, resets timer to 15s)
            </Button>
            <div className="flex gap-3">
              <Button variant="danger" size="md" className="flex-1" onClick={() => judge(false)}>
                Wrong
              </Button>
              <Button variant="primary" size="md" className="flex-1" onClick={() => judge(true)}>
                Correct
              </Button>
            </div>
          </div>
        ) : questionState === "mcq_answering" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {mcqShuffled.map((opt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => judge(opt.correct, true)}
                className="rounded-q-400 border border-q-border-default bg-q-background-secondary px-4 py-3 text-left text-q-body-md-regular hover:bg-q-background-tertiary"
              >
                {opt.text}
              </button>
            ))}
          </div>
        ) : questionState === "time_up" ? (
          <div className="grid place-items-center py-6">
            <Typography as="span" variant="title-sm-semi-bold" color="danger">
              Time's up!
            </Typography>
          </div>
        ) : (
          // result
          <div className="flex flex-col items-center gap-4 py-4">
            <Typography
              as="span"
              variant="title-md-semi-bold"
              color={judgeOutcome?.correct ? "success" : "danger"}
            >
              {judgeOutcome?.timedOut ? "Time's up — no points" : judgeOutcome?.correct ? "Correct!" : "Wrong"}
              {judgeOutcome?.correct && judgeOutcome.viaMcq ? " (half credit)" : ""}
            </Typography>
            <Button variant="primary" size="md" onClick={advance}>
              Next
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ---------- Round break ----------
  if (phase === "round-break") {
    return (
      <Page>
        <PageHeader eyebrow="Live Play" title={`Round ${currentRound + 1} complete`} />
        <AdSlot placement="multiplayer-round-break" />
        <Section>
          <Panel className="divide-y divide-q-border-subtle p-0">
            {teams.map((name, i) => (
              <div key={name} className="flex items-center justify-between px-4 py-3">
                <Typography as="span" variant="body-sm-medium" color="primary">
                  {name}
                </Typography>
                <Typography as="span" variant="label-sm-semi-bold" color="primary">
                  {scores[i]?.score ?? 0}
                </Typography>
              </div>
            ))}
          </Panel>
        </Section>
        <Section>
          <Button variant="primary" size="md" onClick={startNextRound}>
            Start round {currentRound + 2}
          </Button>
        </Section>
      </Page>
    );
  }

  // ---------- Final results ----------
  if (phase === "results") {
    const ranked = teams
      .map((name, i) => ({ name, ...scores[i] }))
      .sort((a, b) => b.score - a.score);
    return (
      <Page>
        <PageHeader eyebrow="Live Play" title="Results" />
        <AdSlot placement="results" />
        <Section>
          <Panel className="divide-y divide-q-border-subtle p-0">
            {ranked.map((team, i) => (
              <div key={team.name} className="flex items-center gap-3 px-4 py-3">
                {i === 0 ? <Trophy className="size-5 text-q-icon-warning" aria-hidden /> : <span className="w-5 text-center text-q-text-tertiary">{i + 1}</span>}
                <div className="flex min-w-0 flex-1 flex-col">
                  <Typography as="span" variant="body-sm-medium" color="primary" truncate>
                    {team.name}
                  </Typography>
                  <Typography as="span" variant="caption-xs-regular" color="tertiary">
                    {team.correct} correct{team.mcqUsed > 0 ? ` · ${team.mcqUsed} via MCQ` : ""}
                  </Typography>
                </div>
                <Typography as="span" variant="title-sm-semi-bold" color="primary">
                  {team.score}
                </Typography>
              </div>
            ))}
          </Panel>
        </Section>
        <Section>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={onExit}>
              Back to home
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPhase("setup")}>
              Play again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              start={<Share2 className="size-4" aria-hidden />}
              onClick={() =>
                shareText(
                  `${ranked[0]?.name ?? "We"} won our Quizora ${isDuo ? "duel" : "match"} ${ranked[0]?.score ?? 0}-${ranked[1]?.score ?? 0}! 🧠`,
                )
              }
            >
              Share
            </Button>
          </div>
        </Section>
      </Page>
    );
  }

  return null;
}
