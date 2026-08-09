export type GameMode = "daily" | "weekly" | "freeplay" | "challenge";

export interface HistoryEntry {
  id: number;
  playedAt: string;
  mode: GameMode;
  categoryLabel: string | null;
  correct: number;
  total: number;
  score: number;
  perfect: boolean;
  perfectBonus: number;
}

export interface WeeklyHistoryEntry {
  id: number;
  week: string;
  playedAt: string;
  score: number;
  perfect: boolean;
  perfectBonus: number;
}

export interface UserSnapshot {
  id: string;
  avatarUrl: string | null;
  xp: number;
  level: number;
  xpInLevel: number;
  streak: number;
  gamesPlayed: number;
  dailyDone: string | null;
  weeklyDone: string | null;
  weeklyScore: number;
  weeklyPerfectBonus: number;
  challengeTokens: number;
  removeAdsActive: boolean;
  history: HistoryEntry[];
  weeklyHistory: WeeklyHistoryEntry[];
  categoryPlays: Record<string, number>;
  unlockedBadgeIds: string[];
  seenBadgeIds: string[];
}

export interface SubmitGameResultInput {
  mode: GameMode;
  categoryLabel?: string;
  correct: number;
  total: number;
  /** Sum of per-question time-remaining bonuses; freeplay scoring only. */
  timeBonusTotal?: number;
  /** Question ids played, used to credit top-level category play counts. */
  questionIds: number[];
}

export interface SubmitGameResultOutput {
  xpEarned: number;
  snapshot: UserSnapshot;
  newlyUnlockedBadgeIds: string[];
  rejected?: "daily-already-done" | "weekly-already-done";
}
