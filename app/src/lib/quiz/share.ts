import { toast } from "@higgsfield/quanta/sonner";

/** Native share sheet where available, clipboard copy otherwise — no
 * generation involved, just a line of text + the app link. */
export async function shareText(text: string): Promise<void> {
  const url = typeof window !== "undefined" ? window.location.origin : "https://quizora.higgsfield.app";
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share({ title: "Quizora", text, url });
    } catch {
      // user cancelled the native share sheet — not an error
    }
    return;
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    toast.success("Copied to clipboard", { description: "Paste it anywhere to share your result." });
  } catch {
    toast.error("Couldn't share", { description: "Try again." });
  }
}
