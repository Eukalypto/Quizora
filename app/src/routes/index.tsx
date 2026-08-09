import { createFileRoute, redirect } from "@tanstack/react-router";
import { LandingPage } from "@higgsfield/app-landing";
import { landingContent } from "@/landing-content";
import { isNativeShell } from "@/lib/native-shell";

export const Route = createFileRoute("/")({
  // No title/description here on purpose: the home page inherits the app's
  // editable page metadata from the root route (set via the marketplace meta
  // API — title/favicon/og), so a shared link to "/" shows the owner's values.
  // Add a `head` here only to give a SPECIFIC page its own title/description
  // (a deeper route's head overrides the root's for that page).
  //
  // The marketing pitch only makes sense for a website visitor who hasn't
  // installed anything yet — someone running the bundled native shell
  // already has the app, so send them straight into it. isNativeShell()
  // is SSR-safe (false on the server), so this never affects the live
  // website's own "/" — only the native shell's client bundle redirects.
  beforeLoad: () => {
    if (isNativeShell()) throw redirect({ to: "/app", search: { preview: false } });
  },
  component: Index,
});

// The public marketing page. The full product lives at /app so marketplace
// visitors can understand the value before entering a complex workspace.
function Index() {
  return <LandingPage content={landingContent} />;
}
