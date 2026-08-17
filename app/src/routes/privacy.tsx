import { createFileRoute } from "@tanstack/react-router";
import { Typography } from "@higgsfield/quanta/typography";

// Standalone, non-app-shell page reachable at quizora's own domain — the URL
// both the App Store and Play Store require in their listing config. No
// auth/app-shell needed; store reviewers and prospective users must be able
// to read this without signing in or installing anything.
//
// DRAFT: accurate to what the app's own code actually does today (Clerk,
// Cloudflare D1/R2, RevenueCat) as of writing, but the bracketed [placeholders]
// (legal entity name, contact email, jurisdiction) need filling in by
// whoever owns that decision, and the whole page should get an actual legal
// review before treating it as final — this is a solid first draft, not a
// substitute for that. Also needs a real update once AdMob is integrated
// (EUK-33) and once any Live Mode content-pack purchases (EUK-36) ship —
// both change what data third parties collect.
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy — Quizora" }],
  }),
  component: Page,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Typography as="h2" variant="title-sm-semi-bold" color="primary">
        {title}
      </Typography>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <Typography as="p" variant="body-sm-regular" color="secondary">
      {children}
    </Typography>
  );
}

function Page() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 p-6 py-12">
      <div className="flex flex-col gap-2">
        <Typography as="h1" variant="title-lg-semi-bold" color="primary">
          Privacy Policy
        </Typography>
        <Typography as="p" variant="caption-sm-regular" color="tertiary">
          Last updated: [DATE] · Applies to the Quizora app and website
        </Typography>
      </div>

      <Section title="Who we are">
        <P>
          Quizora is a trivia game published by [LEGAL ENTITY NAME]. This policy explains what information we
          collect when you use Quizora, why we collect it, and the choices you have. If you have questions, contact
          us at [CONTACT EMAIL].
        </P>
      </Section>

      <Section title="Information we collect">
        <P>
          <strong>Account information.</strong> When you sign in, our authentication provider (Clerk) collects your
          email address, and — if you sign in with Google — your name and profile photo from that account. We use
          this to identify your account and let you sign in again later.
        </P>
        <P>
          <strong>Game data.</strong> We store your XP, level, streak, badges, game history, and category
          preferences so your progress is saved across sessions and devices. If you create an in-app avatar, the
          generated image is stored on our servers and linked to your account.
        </P>
        <P>
          <strong>Online Challenge data.</strong> If you play Online Challenge (asynchronous head-to-head matches),
          we store the round results and, where relevant, the display name of the player you're matched against.
        </P>
        <P>
          <strong>Purchase information.</strong> If you buy Remove Ads, our payments partner (RevenueCat) processes
          the transaction through the Apple App Store or Google Play Store and shares your entitlement status
          (e.g. "ad-free: active") with us — we don't receive or store your payment card details, which are handled
          entirely by Apple or Google.
        </P>
        <P>
          <strong>Technical information.</strong> Like most apps, our infrastructure provider (Cloudflare)
          automatically logs standard technical data (IP address, device/browser type, request timestamps) for
          security and reliability purposes.
        </P>
      </Section>

      <Section title="How we use this information">
        <P>
          To provide and maintain the game (saving your progress, running Daily/Weekly Challenges and Online
          Challenge, applying purchased entitlements), to keep the service secure and prevent abuse, and to respond
          if you contact us for support.
        </P>
        <P>We do not sell your personal information. We do not currently show advertising in Quizora.</P>
      </Section>

      <Section title="Who we share information with">
        <P>We share information with the following service providers, each acting on our behalf:</P>
        <ul className="ml-4 list-disc">
          <li>
            <P>Clerk — authentication and account management</P>
          </li>
          <li>
            <P>Cloudflare — hosting, database, and file storage</P>
          </li>
          <li>
            <P>RevenueCat — subscription and purchase management</P>
          </li>
          <li>
            <P>Apple and Google — processing payments made through their respective app stores</P>
          </li>
        </ul>
        <P>We don't share your information with anyone else, except where required by law.</P>
      </Section>

      <Section title="Data retention and deletion">
        <P>
          We keep your account data for as long as your account is active. You can permanently delete your account
          and all associated data at any time, either from the app (Profile → Danger zone) or from{" "}
          <a href="/account/delete" className="text-q-text-link underline">
            quizora.quizora.workers.dev/account/delete
          </a>{" "}
          without needing the app installed. Deletion is immediate and cannot be undone.
        </P>
      </Section>

      <Section title="Children's privacy">
        <P>
          Quizora is not directed at children under 13, and we do not knowingly collect personal information from
          children under 13. [This section needs an explicit decision — see note to team.]
        </P>
      </Section>

      <Section title="Your rights">
        <P>
          Depending on where you live, you may have rights to access, correct, or delete your personal information,
          and to object to or restrict certain processing. You can exercise most of these directly in the app, or by
          contacting us at [CONTACT EMAIL].
        </P>
      </Section>

      <Section title="Changes to this policy">
        <P>
          We may update this policy from time to time. If we make material changes, we'll update the "Last updated"
          date above.
        </P>
      </Section>

      <Section title="Contact us">
        <P>
          [LEGAL ENTITY NAME]
          <br />
          [ADDRESS, if required by your jurisdiction]
          <br />
          [CONTACT EMAIL]
        </P>
      </Section>
    </div>
  );
}
