// Placeholder avatar pieces — emoji + flat gradients, zero art-asset
// dependency, so the layered customizer is fully usable today. Swapping in
// real illustrated art later is a drop-in change: replace `emoji`/`colors`
// with real asset URLs and update the two render sites (the live CSS preview
// in avatar-creator-modal.tsx and the canvas compositor's draw calls) —
// nothing about the piece IDs, selection state, or persisted config needs to
// change.

export interface AvatarBackground {
  id: string;
  label: string;
  /** Two hex stops for a diagonal gradient — shared by the CSS preview and
   * the canvas compositor so they always render identically. */
  colors: [string, string];
}

export interface AvatarPieceOption {
  id: string;
  label: string;
  emoji: string;
}

export const AVATAR_BACKGROUNDS: AvatarBackground[] = [
  { id: "sunset", label: "Sunset", colors: ["#fb923c", "#ec4899"] },
  { id: "ocean", label: "Ocean", colors: ["#60a5fa", "#22d3ee"] },
  { id: "forest", label: "Forest", colors: ["#22c55e", "#6ee7b7"] },
  { id: "grape", label: "Grape", colors: ["#a855f7", "#e879f9"] },
  { id: "lava", label: "Lava", colors: ["#ef4444", "#fb923c"] },
  { id: "sky", label: "Sky", colors: ["#38bdf8", "#a5b4fc"] },
  { id: "mint", label: "Mint", colors: ["#2dd4bf", "#bef264"] },
  { id: "midnight", label: "Midnight", colors: ["#1e293b", "#312e81"] },
];

export const AVATAR_FACES: AvatarPieceOption[] = [
  { id: "fox", label: "Fox", emoji: "🦊" },
  { id: "cat", label: "Cat", emoji: "🐱" },
  { id: "dog", label: "Dog", emoji: "🐶" },
  { id: "panda", label: "Panda", emoji: "🐼" },
  { id: "lion", label: "Lion", emoji: "🦁" },
  { id: "koala", label: "Koala", emoji: "🐨" },
  { id: "tiger", label: "Tiger", emoji: "🐯" },
  { id: "rabbit", label: "Rabbit", emoji: "🐰" },
  { id: "frog", label: "Frog", emoji: "🐸" },
  { id: "owl", label: "Owl", emoji: "🦉" },
];

export const AVATAR_HATS: AvatarPieceOption[] = [
  { id: "tophat", label: "Top Hat", emoji: "🎩" },
  { id: "cap", label: "Cap", emoji: "🧢" },
  { id: "crown", label: "Crown", emoji: "👑" },
  { id: "gradcap", label: "Grad Cap", emoji: "🎓" },
  { id: "helmet", label: "Helmet", emoji: "⛑️" },
];

export const AVATAR_ACCESSORIES: AvatarPieceOption[] = [
  { id: "sunglasses", label: "Sunglasses", emoji: "🕶️" },
  { id: "glasses", label: "Glasses", emoji: "👓" },
  { id: "bow", label: "Bow", emoji: "🎀" },
  { id: "scarf", label: "Scarf", emoji: "🧣" },
  { id: "star", label: "Star", emoji: "⭐" },
  { id: "gem", label: "Gem", emoji: "💎" },
];

export interface AvatarConfig {
  background: string;
  face: string;
  hat: string | null;
  accessory: string | null;
}

export const DEFAULT_AVATAR_CONFIG: AvatarConfig = {
  background: AVATAR_BACKGROUNDS[0].id,
  face: AVATAR_FACES[0].id,
  hat: null,
  accessory: null,
};

export function findBackground(id: string): AvatarBackground {
  return AVATAR_BACKGROUNDS.find((b) => b.id === id) ?? AVATAR_BACKGROUNDS[0];
}
export function findFace(id: string): AvatarPieceOption {
  return AVATAR_FACES.find((f) => f.id === id) ?? AVATAR_FACES[0];
}
export function findHat(id: string | null): AvatarPieceOption | null {
  return id ? (AVATAR_HATS.find((h) => h.id === id) ?? null) : null;
}
export function findAccessory(id: string | null): AvatarPieceOption | null {
  return id ? (AVATAR_ACCESSORIES.find((a) => a.id === id) ?? null) : null;
}

/** Draws the composited avatar onto a canvas — used to flatten the picked
 * pieces into a single PNG at save time (see avatar-creator-modal.tsx). */
export function drawAvatarToCanvas(ctx: CanvasRenderingContext2D, size: number, config: AvatarConfig): void {
  const bg = findBackground(config.background);
  const face = findFace(config.face);
  const hat = findHat(config.hat);
  const accessory = findAccessory(config.accessory);

  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, bg.colors[0]);
  gradient.addColorStop(1, bg.colors[1]);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = `${Math.round(size * 0.52)}px sans-serif`;
  ctx.fillText(face.emoji, size / 2, size / 2 + size * 0.03);

  if (hat) {
    ctx.font = `${Math.round(size * 0.3)}px sans-serif`;
    ctx.fillText(hat.emoji, size / 2, size * 0.2);
  }
  if (accessory) {
    ctx.font = `${Math.round(size * 0.24)}px sans-serif`;
    ctx.fillText(accessory.emoji, size * 0.78, size * 0.78);
  }
}
