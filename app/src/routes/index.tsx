import { createFileRoute } from "@tanstack/react-router";
import { LandingPage } from "@higgsfield/app-landing";
import { landingContent } from "@/landing-content";

export const Route = createFileRoute("/")({
  // No title/description here on purpose: the home page inherits the app's
  // editable page metadata from the root route (set via the marketplace meta
  // API — title/favicon/og), so a shared link to "/" shows the owner's values.
  // Add a `head` here only to give a SPECIFIC page its own title/description
  // (a deeper route's head overrides the root's for that page).
  component: Index,
});

// The public marketing page. The full product lives at /app so marketplace
// visitors can understand the value before entering a complex workspace.
function Index() {
  return <LandingPage content={landingContent} />;
}
