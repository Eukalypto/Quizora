// Lightweight game-feel SFX synthesized via the Web Audio API — no asset
// files, no dependency, nothing to load. Must be called from within a user
// gesture (a click handler) the first time, since browsers block audio
// context creation/resume outside one.
let ctx: AudioContext | null = null;

// Mute is a device-local preference (localStorage), not an account setting —
// it's about this browser's speaker, not synced across devices. Music has
// its own future toggle; this one only gates the SFX below.
const MUTE_STORAGE_KEY = "quizora-audio-muted";

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(MUTE_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let muted = readStoredMuted();
const muteListeners = new Set<(muted: boolean) => void>();

export function isAudioMuted(): boolean {
  return muted;
}

export function setAudioMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, next ? "1" : "0");
  } catch {
    // localStorage unavailable (private browsing, etc.) — mute still works
    // for this session, just doesn't persist across reloads.
  }
  muteListeners.forEach((listener) => listener(muted));
}

/** For a settings UI to stay in sync if muted elsewhere (e.g. another tab). */
export function subscribeAudioMuted(listener: (muted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => muteListeners.delete(listener);
}

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) ctx = new Ctor();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq: number, startOffset: number, duration: number, gainPeak: number) {
  if (muted) return;
  const audioCtx = getContext();
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + startOffset;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(gainPeak, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** Short bright two-note chime. */
export function playCorrectSound(): void {
  tone(659.25, 0, 0.14, 0.16); // E5
  tone(987.77, 0.09, 0.18, 0.14); // B5
}

/** Short low descending buzz. */
export function playWrongSound(): void {
  tone(220, 0, 0.22, 0.14); // A3
  tone(164.81, 0.08, 0.26, 0.12); // E3
}

/** Bigger triumphant four-note ascending arpeggio — the streak/level-up payoff. */
export function playLevelUpSound(): void {
  tone(523.25, 0, 0.12, 0.15); // C5
  tone(659.25, 0.1, 0.12, 0.15); // E5
  tone(783.99, 0.2, 0.12, 0.15); // G5
  tone(1046.5, 0.3, 0.3, 0.18); // C6
}
