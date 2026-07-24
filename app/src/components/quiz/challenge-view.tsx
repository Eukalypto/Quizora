import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Share2, Swords, Trophy } from "lucide-react";
import { Avatar } from "@higgsfield/quanta/avatar";
import { Button } from "@higgsfield/quanta/button";
import { Loader } from "@higgsfield/quanta/loader";
import { Modal } from "@higgsfield/quanta/modal";
import { toast } from "@higgsfield/quanta/sonner";
import { Typography } from "@higgsfield/quanta/typography";
import { Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import { CategoryPicker } from "@/components/quiz/category-picker";
import { GameSession, type GameResult } from "@/components/quiz/game-session";
import {
  createChallengeFn,
  getChallengeStateFn,
  getRound2QuestionsFn,
  joinChallengeFn,
  startRound2Fn,
  submitRound1Fn,
  submitRound2Fn,
} from "@/lib/api/challenge.functions";
import { ALL_CATEGORIES } from "@/lib/category-list";
import type { Question } from "@/lib/categories";
import type { ChallengeStateResult, JoinedChallengeState } from "@/lib/quiz/challenge.server";
import { shareText } from "@/lib/quiz/share";

function challengeUrl(id: string): string {
  return `${window.location.origin}/app?challenge=${id}`;
}

function ShareLinkModal({ id, open, onOpenChange }: { id: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const url = challengeUrl(id);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.");
    }
  };
  return (
    <Modal.Root open={open} onOpenChange={onOpenChange}>
      <Modal.Content size="sm">
        <Modal.Header>
          <Modal.Title>Share this link</Modal.Title>
          <Modal.CloseButton />
        </Modal.Header>
        <Modal.Body>
          <div className="flex flex-col gap-3">
            <Typography as="p" variant="body-sm-regular" color="secondary">
              Send this to whoever you're challenging — they'll play your round, then set up the next one.
            </Typography>
            <div className="flex items-center gap-2 rounded-q-400 border border-q-border-subtle bg-q-background-secondary px-3 py-2.5">
              <Typography as="span" variant="caption-sm-regular" color="primary" className="min-w-0 flex-1 truncate">
                {url}
              </Typography>
              <Button variant="secondary" size="xs" start={<Copy className="size-3.5" aria-hidden />} onClick={copy}>
                Copy
              </Button>
            </div>
            {typeof navigator !== "undefined" && "share" in navigator ? (
              <Button
                variant="ghost"
                size="sm"
                start={<Share2 className="size-4" aria-hidden />}
                onClick={() => navigator.share({ title: "Quizora challenge", url }).catch(() => {})}
              >
                Or use your device's share sheet
              </Button>
            ) : null}
          </div>
        </Modal.Body>
      </Modal.Content>
    </Modal.Root>
  );
}

type Phase =
  | "intro" // creator: pick category. opponent (fresh link): "you've been challenged"
  | "playing"
  | "pick-round2-category" // opponent only, right after their round1
  | "share" // after creator's round1, or after opponent's round2
  | "waiting"
  | "results";

export function ChallengeView({ challengeId, onExit }: { challengeId?: string; onExit: () => void }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(challengeId ?? null);
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null); // null = derive from server
  const [roundQuestions, setRoundQuestions] = useState<Question[] | null>(null);
  const [playingRound, setPlayingRound] = useState<1 | 2>(1);
  const [isCreatorLocal, setIsCreatorLocal] = useState<boolean | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const stateQuery = useQuery({
    queryKey: ["challenge", activeId],
    // Fetched whenever we have an id — "share"/"results" screens display
    // fields off this data too, not just the "derive my phase" path.
    queryFn: () => getChallengeStateFn({ data: { id: activeId! } }),
    enabled: !!activeId && phase !== "playing",
  });
  const data = stateQuery.data as ChallengeStateResult | undefined;

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["challenge", activeId] });

  const startAsCreator = async () => {
    if (!selectedCategoryKey) return;
    setStarting(true);
    try {
      const result = await createChallengeFn({ data: { categoryKey: selectedCategoryKey } });
      if (!result.ok) {
        toast.error("Couldn't create that challenge.");
        return;
      }
      setActiveId(result.id);
      setRoundQuestions(result.questions);
      setPlayingRound(1);
      setIsCreatorLocal(true);
      setPhase("playing");
    } catch {
      toast.error("Couldn't start your round", { description: "Try again in a moment." });
    } finally {
      setStarting(false);
    }
  };

  const joinAsOpponent = async () => {
    if (!activeId) return;
    setStarting(true);
    try {
      const result = await joinChallengeFn({ data: { id: activeId } });
      if (!result.ok) {
        const messages: Record<string, string> = {
          not_found: "That challenge link doesn't exist.",
          expired: "This invite has expired — ask for a new one.",
          already_full: "This challenge already has two players.",
          own_challenge: "You can't join your own challenge.",
          already_played: "You've already played this round.",
        };
        toast.error(messages[result.error] ?? "Couldn't join that challenge.");
        return;
      }
      setRoundQuestions(result.questions);
      setPlayingRound(1);
      setIsCreatorLocal(false);
      setPhase("playing");
    } catch {
      toast.error("Couldn't join that challenge", { description: "Try again in a moment." });
    } finally {
      setStarting(false);
    }
  };

  const startRound2AsOpponent = async () => {
    if (!activeId || !selectedCategoryKey) return;
    setStarting(true);
    try {
      const result = await startRound2Fn({ data: { id: activeId, categoryKey: selectedCategoryKey } });
      if (!result.ok) {
        toast.error("Couldn't start round 2.");
        return;
      }
      setRoundQuestions(result.questions);
      setPlayingRound(2);
      setIsCreatorLocal(false);
      setPhase("playing");
    } catch {
      toast.error("Couldn't start round 2", { description: "Try again in a moment." });
    } finally {
      setStarting(false);
    }
  };

  // Resumes round 2 for whichever role hasn't played it yet — the creator's
  // normal path there, or either role re-fetching after navigating away
  // mid-round instead of finishing it in one sitting.
  const resumeRound2 = async (asCreator: boolean) => {
    if (!activeId) return;
    setStarting(true);
    try {
      const result = await getRound2QuestionsFn({ data: { id: activeId } });
      if (!result.questions) {
        toast.error("Round 2 isn't ready yet.");
        return;
      }
      setRoundQuestions(result.questions);
      setPlayingRound(2);
      setIsCreatorLocal(asCreator);
      setPhase("playing");
    } catch {
      toast.error("Couldn't load round 2", { description: "Try again in a moment." });
    } finally {
      setStarting(false);
    }
  };

  const handleComplete = async (result: GameResult) => {
    if (!activeId) return;
    const submit = playingRound === 1 ? submitRound1Fn : submitRound2Fn;
    try {
      await submit({ data: { id: activeId, correct: result.correct, total: result.total, score: result.score } });
    } catch {
      toast.error("Couldn't save your round", { description: "Your score may not have been recorded." });
    }
    refresh();
    setSelectedCategoryKey(null);
    if (playingRound === 1) {
      // Creator's round 1 -> share it. Opponent's round 1 -> pick round 2's category.
      setPhase(isCreatorLocal ? "share" : "pick-round2-category");
    } else {
      // Opponent's round 2 -> share it back. Creator's round 2 -> results (opponent's side is already done by now).
      setPhase(isCreatorLocal ? "results" : "share");
    }
  };

  // ---------- Derive phase from server state when not mid-local-flow ----------
  let derivedPhase = phase;
  if (derivedPhase == null && data) {
    if (data.kind === "not_found" || data.kind === "not_joined") {
      derivedPhase = "intro";
    } else {
      const d = data as JoinedChallengeState;
      if (!d.round1.me.completed) {
        // Left mid-round-1 without submitting (refresh, closed tab, etc.) —
        // no persisted "in-progress" state to resume from, same as any
        // other game mode losing progress on refresh. Waiting is the least
        // broken fallback rather than silently restarting a paid-for round.
        derivedPhase = "waiting";
      } else if (!d.round2) {
        derivedPhase = d.isCreator ? "waiting" : "pick-round2-category";
      } else if (!d.round2.me.completed) {
        derivedPhase = "waiting"; // resolved to a "play round 2" action below, for whichever role it is
      } else if (d.round2.opponent.completed) {
        derivedPhase = "results";
      } else {
        derivedPhase = "waiting";
      }
    }
  }

  // ---------- Playing ----------
  if (derivedPhase === "playing" && roundQuestions) {
    return <GameSession mode="challenge" questions={roundQuestions} onComplete={handleComplete} onExit={onExit} />;
  }

  // ---------- Loading ----------
  if (activeId && phase == null && stateQuery.isLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Loader variant="stars" size="lg" />
      </div>
    );
  }

  // ---------- Intro: create (no link) or land on a link ----------
  if (derivedPhase === "intro" || (!activeId && derivedPhase == null)) {
    if (data?.kind === "not_found") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <Typography as="p" variant="title-sm-semi-bold" color="danger">
            That challenge link doesn't exist
          </Typography>
          <Button variant="secondary" size="sm" onClick={onExit}>
            Back to home
          </Button>
        </div>
      );
    }
    if (data?.kind === "not_joined" && (data.expired || data.full)) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
          <Typography as="p" variant="title-sm-semi-bold" color="danger">
            {data.expired ? "This challenge invite has expired" : "This challenge already has two players"}
          </Typography>
          <Button variant="secondary" size="sm" onClick={onExit}>
            Back to home
          </Button>
        </div>
      );
    }
    if (challengeId && data?.kind === "not_joined") {
      return (
        <Page>
          <PageHeader eyebrow="Challenge" title={`${data.creatorName ?? "Someone"} challenged you!`} />
          <Section>
            <Panel className="flex flex-col items-center gap-4 py-8 text-center">
              <Swords className="size-10 text-q-icon-secondary" aria-hidden />
              <Typography as="p" variant="body-sm-regular" color="secondary" className="max-w-xs">
                Play their round first — then you'll pick a category and set up round 2 for them.
              </Typography>
              <Button variant="primary" size="md" disabled={starting} onClick={joinAsOpponent}>
                {starting ? "Loading…" : "Play round 1"}
              </Button>
            </Panel>
          </Section>
          <Section>
            <Button variant="ghost" size="sm" onClick={onExit}>
              Not now
            </Button>
          </Section>
        </Page>
      );
    }
    // Creating a brand-new challenge.
    return (
      <Page>
        <PageHeader
          eyebrow="Challenge"
          title="Challenge a friend"
          description="Pick a category and play 10 questions — your friend plays your round, then sets up their own for you."
        />
        <Section>
          <div className="flex justify-end">
            <Button variant="primary" size="md" disabled={!selectedCategoryKey || starting} onClick={startAsCreator}>
              {starting ? "Starting…" : "Start round 1"}
            </Button>
          </div>
          <CategoryPicker
            categories={ALL_CATEGORIES}
            selectedKeys={selectedCategoryKey ? [selectedCategoryKey] : []}
            onToggle={(key) => setSelectedCategoryKey((current) => (current === key ? null : key))}
          />
        </Section>
        <Section>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onExit}>
              Back
            </Button>
            <Button variant="primary" size="md" disabled={!selectedCategoryKey || starting} onClick={startAsCreator}>
              {starting ? "Starting…" : "Start round 1"}
            </Button>
          </div>
        </Section>
      </Page>
    );
  }

  if (!data || data.kind !== "joined") {
    return (
      <div className="grid h-full place-items-center">
        <Loader variant="stars" size="lg" />
      </div>
    );
  }

  // ---------- Opponent picks round 2's category, right after their round 1 ----------
  if (derivedPhase === "pick-round2-category") {
    return (
      <Page>
        <PageHeader eyebrow="Challenge" title="Your turn to set round 2" description="Pick a category — your friend plays this one next." />
        <Section>
          <div className="flex justify-end">
            <Button variant="primary" size="md" disabled={!selectedCategoryKey || starting} onClick={startRound2AsOpponent}>
              {starting ? "Starting…" : "Start round 2"}
            </Button>
          </div>
          <CategoryPicker
            categories={ALL_CATEGORIES}
            selectedKeys={selectedCategoryKey ? [selectedCategoryKey] : []}
            onToggle={(key) => setSelectedCategoryKey((current) => (current === key ? null : key))}
          />
        </Section>
        <Section>
          <Button variant="primary" size="md" disabled={!selectedCategoryKey || starting} onClick={startRound2AsOpponent}>
            {starting ? "Starting…" : "Start round 2"}
          </Button>
        </Section>
      </Page>
    );
  }

  // ---------- Share (after creator's round 1, or opponent's round 2) ----------
  if (derivedPhase === "share") {
    return (
      <Page>
        <PageHeader eyebrow="Challenge" title="Your round is in!" />
        <Section>
          <Panel className="flex flex-col items-center gap-4 py-8 text-center">
            <Swords className="size-10 text-q-icon-secondary" aria-hidden />
            <Typography as="p" variant="body-sm-regular" color="secondary">
              Share the link so {data.opponentName ?? "they"} can take their turn.
            </Typography>
            <Button variant="primary" size="md" start={<Share2 className="size-4" aria-hidden />} onClick={() => setShareOpen(true)}>
              {data.isCreator ? "Challenge a friend" : "Challenge back"}
            </Button>
          </Panel>
        </Section>
        <Section>
          <Button variant="ghost" size="sm" onClick={onExit}>
            Back to home
          </Button>
        </Section>
        <ShareLinkModal id={activeId!} open={shareOpen} onOpenChange={setShareOpen} />
      </Page>
    );
  }

  // ---------- Round 2 exists and this player hasn't completed it yet ----------
  if (derivedPhase === "waiting" && data.round2 && !data.round2.me.completed) {
    return (
      <Page>
        <PageHeader eyebrow="Challenge" title="Round 2 is ready!" description={`${data.opponentName ?? "Your opponent"} picked ${data.round2.categoryLabel}.`} />
        <Section>
          <Panel className="flex flex-col items-center gap-4 py-8 text-center">
            <Swords className="size-10 text-q-icon-secondary" aria-hidden />
            <Button variant="primary" size="md" disabled={starting} onClick={() => resumeRound2(data.isCreator)}>
              {starting ? "Loading…" : "Play round 2"}
            </Button>
          </Panel>
        </Section>
      </Page>
    );
  }

  // ---------- Waiting on the other player ----------
  if (derivedPhase === "waiting") {
    return (
      <Page>
        <PageHeader eyebrow="Challenge" title="Waiting on your opponent" />
        <Section>
          <Panel className="flex flex-col items-center gap-4 py-8 text-center">
            <Loader variant="stars" size="lg" />
            <Typography as="p" variant="body-sm-regular" color="secondary">
              Check back once {data.opponentName ?? "they"}'ve taken their turn.
            </Typography>
          </Panel>
        </Section>
        <Section>
          <Button variant="ghost" size="sm" onClick={onExit}>
            Back to home
          </Button>
        </Section>
      </Page>
    );
  }

  // ---------- Results ----------
  if (derivedPhase === "results" && data.round2) {
    const myTotal = (data.round1.me.score ?? 0) + (data.round2.me.score ?? 0);
    const oppTotal = (data.round1.opponent.score ?? 0) + (data.round2.opponent.score ?? 0);
    const iWon = myTotal > oppTotal;
    const tied = myTotal === oppTotal;
    const shareResult = () =>
      shareText(
        tied
          ? `I tied my Quizora challenge ${myTotal}-${oppTotal} against ${data.opponentName ?? "a friend"}! 🧠`
          : iWon
            ? `I beat ${data.opponentName ?? "a friend"} ${myTotal}-${oppTotal} in a Quizora challenge! 🧠`
            : `${data.opponentName ?? "A friend"} beat me ${oppTotal}-${myTotal} in a Quizora challenge — rematch? 🧠`,
      );

    return (
      <Page>
        <PageHeader
          eyebrow="Challenge"
          title={tied ? "It's a tie!" : iWon ? "You won! 🎉" : "You lost this one"}
          actions={
            <Button variant="ghost" size="md" start={<Share2 className="size-4" aria-hidden />} onClick={shareResult}>
              Share
            </Button>
          }
        />
        <Section>
          <Panel className="divide-y divide-q-border-subtle p-0">
            <div className="flex items-center gap-3 px-4 py-3">
              {iWon ? <Trophy className="size-5 text-q-icon-warning" aria-hidden /> : <span className="w-5" />}
              <div className="flex min-w-0 flex-1 flex-col">
                <Typography as="span" variant="body-sm-medium" color="primary">
                  You
                </Typography>
                <Typography as="span" variant="caption-xs-regular" color="tertiary">
                  R1 {data.round1.me.correct}/{data.round1.me.total} · R2 {data.round2.me.correct}/{data.round2.me.total}
                </Typography>
              </div>
              <Typography as="span" variant="title-sm-semi-bold" color="primary">
                {myTotal}
              </Typography>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              {!iWon && !tied ? <Trophy className="size-5 text-q-icon-warning" aria-hidden /> : <span className="w-5" />}
              <Avatar size="sm" src={data.opponentAvatar ?? undefined} alt={data.opponentName ?? "Opponent"} />
              <div className="flex min-w-0 flex-1 flex-col">
                <Typography as="span" variant="body-sm-medium" color="primary" truncate>
                  {data.opponentName ?? "Opponent"}
                </Typography>
                <Typography as="span" variant="caption-xs-regular" color="tertiary">
                  R1 {data.round1.opponent.correct}/{data.round1.opponent.total} · R2 {data.round2.opponent.correct}/{data.round2.opponent.total}
                </Typography>
              </div>
              <Typography as="span" variant="title-sm-semi-bold" color="primary">
                {oppTotal}
              </Typography>
            </div>
          </Panel>
        </Section>
        <Section>
          <Button variant="primary" size="sm" onClick={onExit}>
            Back to home
          </Button>
        </Section>
      </Page>
    );
  }

  return (
    <div className="grid h-full place-items-center">
      <Loader variant="stars" size="lg" />
    </div>
  );
}
