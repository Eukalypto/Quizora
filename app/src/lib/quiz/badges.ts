import taxonomyJson from "@/data/taxonomy.json";
import type { HistoryEntry, WeeklyHistoryEntry } from "./types";

// Imported directly from the JSON (not question-bank.ts) so client code that
// only needs the tiny taxonomy doesn't drag the ~11k-question bank into the
// browser bundle — see src/lib/category-list.ts for the same pattern.
const TAXONOMY = taxonomyJson as { topLevel: string[]; continents: string[]; centuries: string[] };

export interface BadgeContext {
  xp: number;
  streak: number;
  gamesPlayed: number;
  weeklyDone: string | null;
  history: HistoryEntry[];
  weeklyHistory: WeeklyHistoryEntry[];
  categoryPlays: Record<string, number>;
}

export interface BadgeDef {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  unlocked: (ctx: BadgeContext) => boolean;
}

// Reference build shipped 12 badges, two of which ("Scientist", "Explorer")
// were permanently `() => false` — their criteria depended on per-category
// play counts that didn't exist in state. quiz_category_plays (see migration
// 0002) makes both real here. "Top 10" depended on a client-fabricated
// leaderboard rank that only got computed as a side effect of viewing a tab;
// there is no real cross-player leaderboard in v1, so it's replaced with an
// honest metric (3 completed weekly challenges) rather than ported as-is.
export const BADGES: BadgeDef[] = [
  {
    id: "streak-7",
    emoji: "🔥",
    label: "7-Day Streak",
    desc: "Maintain a 7-day daily challenge streak",
    unlocked: (ctx) => ctx.streak >= 7,
  },
  {
    id: "streak-3",
    emoji: "📅",
    label: "Consistent",
    desc: "Maintain a 3-day daily streak",
    unlocked: (ctx) => ctx.streak >= 3,
  },
  {
    id: "weekly-first",
    emoji: "🏆",
    label: "Weekly Champ",
    desc: "Complete your first weekly challenge",
    unlocked: (ctx) => ctx.weeklyDone != null,
  },
  {
    id: "weekly-regular",
    emoji: "🥇",
    label: "Weekly Regular",
    desc: "Complete 3 weekly challenges",
    unlocked: (ctx) => ctx.weeklyHistory.length >= 3,
  },
  {
    id: "first-game",
    emoji: "⚡",
    label: "Speed Demon",
    desc: "Play your first game",
    unlocked: (ctx) => ctx.gamesPlayed >= 1,
  },
  {
    id: "scientist",
    emoji: "🔬",
    label: "Scientist",
    desc: "Play 5 Sciences free play sessions",
    unlocked: (ctx) => (ctx.categoryPlays["sciences"] ?? 0) >= 5,
  },
  {
    id: "scholar",
    emoji: "📚",
    label: "Scholar",
    desc: "Earn 200 or more total XP",
    unlocked: (ctx) => ctx.xp >= 200,
  },
  {
    id: "explorer",
    emoji: "🌍",
    label: "Explorer",
    desc: "Play every category at least once",
    unlocked: (ctx) => TAXONOMY.topLevel.every((tag) => (ctx.categoryPlays[tag] ?? 0) >= 1),
  },
  {
    id: "sharp-eye",
    emoji: "🎯",
    label: "Sharp Eye",
    desc: "Score 100% on a daily challenge",
    unlocked: (ctx) => ctx.history.some((h) => h.mode === "daily" && h.perfect),
  },
  {
    id: "perfect-week",
    emoji: "💯",
    label: "Perfect Week",
    desc: "Score perfectly on the weekly challenge (+20 pts bonus)",
    unlocked: (ctx) => ctx.weeklyHistory.some((w) => w.perfect),
  },
  {
    id: "big-brain",
    emoji: "🧠",
    label: "Big Brain",
    desc: "Play 10 or more games total",
    unlocked: (ctx) => ctx.gamesPlayed >= 10,
  },
  {
    id: "overachiever",
    emoji: "🚀",
    label: "Overachiever",
    desc: "Earn 500 or more total XP",
    unlocked: (ctx) => ctx.xp >= 500,
  },
];

export function evaluateBadges(ctx: BadgeContext): string[] {
  return BADGES.filter((b) => b.unlocked(ctx)).map((b) => b.id);
}
