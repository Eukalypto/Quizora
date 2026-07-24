import { adsEnabled } from "@/lib/quiz/config";

/**
 * Insertion point for future ads (between multiplayer rounds, on results
 * screens). No SDK, no network calls — renders nothing while
 * `adsEnabled` is false.
 */
export function AdSlot({ placement }: { placement: "multiplayer-round-break" | "results" }) {
  if (!adsEnabled) return null;
  return <div data-ad-slot={placement} />;
}
