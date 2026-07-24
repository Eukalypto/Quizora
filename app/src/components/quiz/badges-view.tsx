import { Typography } from "@higgsfield/quanta/typography";
import { Page, PageHeader, Section } from "@/components/custom-ui";
import { BADGES } from "@/lib/quiz/badges";
import { cn } from "@/lib/utils";

export function BadgesView({ unlockedBadgeIds }: { unlockedBadgeIds: string[] }) {
  return (
    <Page>
      <PageHeader
        eyebrow="Profile"
        title="Badges"
        description={`${unlockedBadgeIds.length} / ${BADGES.length} earned`}
      />
      <Section>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {BADGES.map((badge) => {
            const unlocked = unlockedBadgeIds.includes(badge.id);
            return (
              <div
                key={badge.id}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-q-500 border border-q-border-subtle bg-q-transparent-light-05 p-4 text-center",
                  !unlocked && "opacity-40",
                )}
              >
                <span className="text-3xl" aria-hidden>
                  {badge.emoji}
                </span>
                <Typography as="span" variant="label-sm-semi-bold" color="primary">
                  {badge.label}
                </Typography>
                <Typography as="span" variant="caption-xs-regular" color="tertiary">
                  {badge.desc}
                </Typography>
              </div>
            );
          })}
        </div>
      </Section>
    </Page>
  );
}
