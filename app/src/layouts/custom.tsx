"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { House, Medal, Sparkle, UserCircle } from "@phosphor-icons/react";
import { Loader } from "@higgsfield/quanta/loader";
import { toast } from "@higgsfield/quanta/sonner";
import { CustomAppShell, WorkspaceContent } from "@/components/custom-ui";
import type { NavigationItem } from "@/components/custom-ui";
import { BadgesView } from "@/components/quiz/badges-view";
import { ChallengeInboxView } from "@/components/quiz/challenge-inbox-view";
import { ChallengeView } from "@/components/quiz/challenge-view";
import { GameSession, type GameResult } from "@/components/quiz/game-session";
import { HistoryView } from "@/components/quiz/history-view";
import { HomeView } from "@/components/quiz/home-view";
import { LivePlaySelectView } from "@/components/quiz/live-play-select-view";
import { MultiplayerView, type MultiplayerVariant } from "@/components/quiz/multiplayer-view";
import { MysteryGalleryView } from "@/components/quiz/mystery-gallery-view";
import { MysteryRoundView } from "@/components/quiz/mystery-round-view";
import { ProfileView } from "@/components/quiz/profile-view";
import { RanksView } from "@/components/quiz/ranks-view";
import { ScoreView } from "@/components/quiz/score-view";
import { SoloView } from "@/components/quiz/solo-view";
import { useCurrentUser, loginRedirect, type CurrentUser } from "@/hooks/use-current-user";
import type { Difficulty, Question } from "@/lib/categories";
import { getSnapshot, startDaily, startFreePlay, startWeekly, submitResult } from "@/lib/api/quiz.functions";
import { ALL_CATEGORIES } from "@/lib/category-list";
import type { GameMode, SubmitGameResultOutput } from "@/lib/quiz/types";

const NAVIGATION: NavigationItem[] = [
  { id: "home", label: "Home", icon: House, gradient: "blue" },
  { id: "freeplay", label: "Free Play", icon: Sparkle, gradient: "green" },
  { id: "ranks", label: "Ranks", icon: Medal, gradient: "orange" },
  { id: "profile", label: "Profile", icon: UserCircle, gradient: "purple" },
] satisfies NavigationItem[];

type View =
  | "home"
  | "solo"
  | "badges"
  | "history"
  | "profile"
  | "ranks"
  | "liveplay"
  | "multiplayer"
  | "mystery"
  | "mystery-gallery"
  | "play"
  | "score"
  | "challenge"
  | "challenge-inbox";

interface PlaySession {
  mode: GameMode;
  questions: Question[];
  categoryLabel?: string;
}

interface ScoreState extends GameResult {
  output: SubmitGameResultOutput;
}

function SignInRequired() {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="grid max-w-sm gap-3">
        <h2 className="text-q-title-md-semi-bold text-q-text-primary">Sign in to play</h2>
        <p className="text-q-body-sm-regular text-q-text-secondary">
          Your streak, XP, badges, and history are tied to your account.
        </p>
        <div>
          <button
            type="button"
            onClick={() => loginRedirect()}
            className="rounded-q-400 bg-q-brand-primary px-4 py-2 text-q-body-sm-medium text-q-text-inverse"
          >
            Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

function QuizoraApp({ challengeId }: { challengeId?: string }) {
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [view, setView] = useState<View>(challengeId ? "challenge" : "home");
  const [selectedChallengeId, setSelectedChallengeId] = useState<string | undefined>(challengeId);
  const [playSession, setPlaySession] = useState<PlaySession | null>(null);
  const [scoreState, setScoreState] = useState<ScoreState | null>(null);
  const [multiplayerVariant, setMultiplayerVariant] = useState<MultiplayerVariant>("teams");

  const snapshotQuery = useQuery({
    queryKey: ["quiz-snapshot"],
    queryFn: () => getSnapshot(),
    enabled: !!user,
  });

  const refreshSnapshot = () => queryClient.invalidateQueries({ queryKey: ["quiz-snapshot"] });

  const handleStartDaily = async () => {
    try {
      const questions = await startDaily();
      setPlaySession({ mode: "daily", questions });
      setView("play");
    } catch {
      toast.error("Couldn't start the daily challenge", { description: "Check your connection and try again." });
    }
  };

  const handleStartWeekly = async () => {
    try {
      const questions = await startWeekly();
      setPlaySession({ mode: "weekly", questions });
      setView("play");
    } catch {
      toast.error("Couldn't start the weekly challenge", { description: "Check your connection and try again." });
    }
  };

  const handleStartFreePlay = async (categoryKey: string, difficulty: Difficulty) => {
    const category = ALL_CATEGORIES.find((c) => c.key === categoryKey);
    if (!category) return;
    const level = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : 3;
    try {
      const questions = await startFreePlay({ data: { categoryTags: category.tags, level } });
      if (questions.length === 0) {
        toast.warning("No questions available yet", {
          description: `${category.label} has nothing at that difficulty. Try another category or difficulty.`,
        });
        return;
      }
      setPlaySession({ mode: "freeplay", questions, categoryLabel: category.label });
      setView("play");
    } catch {
      toast.error("Couldn't start free play", { description: "Check your connection and try again." });
    }
  };

  const handleGameComplete = async (result: GameResult) => {
    // Challenge mode has its own completion path (challenge-view.tsx calls
    // submitChallengeRoundFn directly) and never routes through here — this
    // guard + cast is just to satisfy submitResult's narrower 3-mode schema
    // (control-flow narrowing on `result.mode` doesn't survive the awaited
    // call below, so it needs to be explicit).
    if (result.mode === "challenge") return;
    const safeResult = result as Omit<GameResult, "mode"> & { mode: "daily" | "weekly" | "freeplay" };
    try {
      const output = await submitResult({ data: safeResult });
      setScoreState({ ...safeResult, output });
      setPlaySession(null);
      setView("score");
      refreshSnapshot();
    } catch {
      toast.error("Couldn't save your result", {
        description: "Your score wasn't recorded — check your connection and try again.",
      });
      setPlaySession(null);
      setView("solo");
    }
  };

  if (userLoading) {
    return (
      <div className="grid h-full place-items-center">
        <Loader variant="stars" size="lg" />
      </div>
    );
  }

  if (!user) {
    return (
      <CustomAppShell brand="Quizora" navigation={NAVIGATION} activeId="home" onNavigate={() => {}}>
        <WorkspaceContent mode="page">
          <SignInRequired />
        </WorkspaceContent>
      </CustomAppShell>
    );
  }

  const snapshot = snapshotQuery.data;

  const activeNavId =
    view === "solo"
      ? "freeplay"
      : view === "badges" || view === "history" || view === "challenge-inbox"
        ? "profile"
        : view === "challenge"
          ? "home"
          : view;

  const navigate = (id: string) => {
    setPlaySession(null);
    setScoreState(null);
    // Nav shows "Free Play" but there's no dedicated view for it — it lives
    // inside Solo. activeNavId already maps "solo" -> "freeplay" for
    // highlighting; this is the inverse, so clicking it actually goes there.
    setView((id === "freeplay" ? "solo" : id) as View);
  };

  let content: React.ReactNode = null;

  if (view === "play" && playSession) {
    content = (
      <GameSession
        mode={playSession.mode}
        questions={playSession.questions}
        categoryLabel={playSession.categoryLabel}
        onComplete={handleGameComplete}
        onExit={() => setView("solo")}
      />
    );
  } else if (view === "score" && scoreState) {
    content = (
      <ScoreView
        mode={scoreState.mode}
        correct={scoreState.correct}
        total={scoreState.total}
        score={scoreState.score}
        categoryLabel={scoreState.categoryLabel}
        xpEarned={scoreState.output.xpEarned}
        newLevel={scoreState.output.snapshot.level}
        streak={scoreState.output.snapshot.streak}
        newlyUnlockedBadgeIds={scoreState.output.newlyUnlockedBadgeIds}
        rejected={scoreState.output.rejected}
        onDone={() => setView("solo")}
      />
    );
  } else if (view === "liveplay") {
    content = (
      <LivePlaySelectView
        onSelect={(variant) => {
          setMultiplayerVariant(variant);
          setView("multiplayer");
        }}
      />
    );
  } else if (view === "multiplayer") {
    content = <MultiplayerView variant={multiplayerVariant} onExit={() => setView("home")} />;
  } else if (view === "mystery") {
    content = <MysteryRoundView onComplete={handleGameComplete} onExit={() => setView("solo")} />;
  } else if (view === "mystery-gallery") {
    content = <MysteryGalleryView />;
  } else if (view === "challenge") {
    content = <ChallengeView challengeId={selectedChallengeId} onExit={() => setView("home")} />;
  } else if (view === "challenge-inbox") {
    content = (
      <ChallengeInboxView
        onOpenChallenge={(id) => {
          setSelectedChallengeId(id);
          setView("challenge");
        }}
        onNewChallenge={() => {
          setSelectedChallengeId(undefined);
          setView("challenge");
        }}
      />
    );
  } else if (!snapshot) {
    content = (
      <div className="grid h-full place-items-center">
        <Loader variant="stars" size="lg" />
      </div>
    );
  } else if (view === "home") {
    content = (
      <HomeView
        user={user as CurrentUser}
        avatarUrl={snapshot.avatarUrl}
        onOpenSolo={() => setView("solo")}
        onOpenMultiplayer={() => setView("liveplay")}
        onOpenMystery={() => setView("mystery")}
        onOpenChallenge={() => setView("challenge-inbox")}
        onOpenProfile={() => setView("profile")}
      />
    );
  } else if (view === "solo") {
    content = (
      <SoloView
        snapshot={snapshot}
        onStartDaily={handleStartDaily}
        onStartWeekly={handleStartWeekly}
        onStartFreePlay={handleStartFreePlay}
        onStartMystery={() => setView("mystery")}
        onOpenMysteryGallery={() => setView("mystery-gallery")}
      />
    );
  } else if (view === "badges") {
    content = <BadgesView unlockedBadgeIds={snapshot.unlockedBadgeIds} />;
  } else if (view === "history") {
    content = <HistoryView history={snapshot.history} />;
  } else if (view === "ranks") {
    content = <RanksView snapshot={snapshot} />;
  } else if (view === "profile") {
    content = (
      <ProfileView
        user={user as CurrentUser}
        snapshot={snapshot}
        onOpenBadges={() => setView("badges")}
        onOpenHistory={() => setView("history")}
        onOpenMysteryGallery={() => setView("mystery-gallery")}
        onAvatarSaved={refreshSnapshot}
      />
    );
  }

  const isFullBleed = view === "play" || view === "multiplayer" || view === "mystery" || view === "home";

  return (
    <CustomAppShell brand="Quizora" navigation={NAVIGATION} activeId={activeNavId} onNavigate={navigate}>
      <WorkspaceContent mode="page" className={isFullBleed ? "flex flex-col" : undefined}>
        {content}
      </WorkspaceContent>
    </CustomAppShell>
  );
}

function QuizoraPreview() {
  return (
    <CustomAppShell brand="Quizora" navigation={NAVIGATION} activeId="home" onNavigate={() => {}}>
      <WorkspaceContent mode="page" className="flex flex-col">
        <HomeView
          user={{ id: "preview", name: "Guest" }}
          onOpenSolo={() => {}}
          onOpenMultiplayer={() => {}}
          onOpenMystery={() => {}}
          onOpenChallenge={() => {}}
        />
      </WorkspaceContent>
    </CustomAppShell>
  );
}

export function CustomTemplate({
  previewMode = false,
  challengeId,
}: {
  previewMode?: boolean;
  challengeId?: string;
}) {
  return (
    <div
      className="h-dvh"
      data-app-preview={previewMode ? "true" : undefined}
      inert={previewMode ? true : undefined}
    >
      {previewMode ? <QuizoraPreview /> : <QuizoraApp challengeId={challengeId} />}
    </div>
  );
}
