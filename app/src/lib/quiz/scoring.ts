import type { GameMode } from "./types";

export function xpForGame(mode: GameMode, correct: number): number {
  const modeBonus = mode === "daily" ? 20 : mode === "weekly" ? 40 : 5;
  return correct * 10 + modeBonus;
}

export function getLevel(xp: number): number {
  return Math.floor(xp / 100) + 1;
}

export function getXpInLevel(xp: number): number {
  return xp % 100;
}

export function normalizedScore(correct: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((correct / total) * 100);
}

/** Timer length in seconds. Daily/weekly are flat; freeplay scales with difficulty. */
export function timerSecondsFor(mode: GameMode, level: 1 | 2 | 3): number {
  if (mode === "daily") return 20;
  if (mode === "weekly") return 25;
  return level === 1 ? 10 : level === 2 ? 20 : 30;
}

export function todayIso(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/** ISO 8601 week string, e.g. "2026-W29" (Thursday-anchored, per the standard). */
export function isoWeek(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/** Number of whole calendar days between two ISO date strings (b - a). */
export function daysBetweenIso(a: string, b: string): number {
  const msPerDay = 86400000;
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const da = Date.UTC(ay, am - 1, ad);
  const db = Date.UTC(by, bm - 1, bd);
  return Math.round((db - da) / msPerDay);
}

/**
 * Streak transition on a daily-challenge completion. The reference build
 * never implemented breaking — it just incremented forever regardless of
 * gaps. This is the real rule: consecutive day -> +1, same day -> no-op
 * (caller should already reject same-day resubmits before reaching here),
 * any gap -> reset to 1.
 */
export function nextStreak(currentStreak: number, lastDailyDone: string | null, today: string): number {
  if (lastDailyDone === null) return 1;
  const gap = daysBetweenIso(lastDailyDone, today);
  if (gap === 1) return currentStreak + 1;
  return 1;
}

/** Deterministic PRNG (mulberry32) seeded from a string, for "same for
 * everyone this week" weekly-challenge selection without curated content. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let state = h >>> 0;
  const next = () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { seededShuffle };
