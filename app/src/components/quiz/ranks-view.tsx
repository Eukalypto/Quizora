import { Trophy } from "lucide-react";
import { Typography } from "@higgsfield/quanta/typography";
import { EmptyState, MetricCard, Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import type { UserSnapshot } from "@/lib/quiz/types";

export function RanksView({ snapshot }: { snapshot: UserSnapshot }) {
  const bestWeekly = snapshot.weeklyHistory.reduce((max, w) => Math.max(max, w.score), 0);

  return (
    <Page>
      <PageHeader eyebrow="Weekly" title="Ranks" description="Your weekly challenge performance." />

      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <MetricCard icon={Trophy} label="Best weekly score" value={bestWeekly || "—"} />
          <MetricCard icon={Trophy} label="Weekly challenges completed" value={snapshot.weeklyHistory.length} />
        </div>
      </Section>

      <Section title="Weekly history">
        {snapshot.weeklyHistory.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="No weekly runs yet"
            description="Play this week's challenge from the Solo tab to see it here."
          />
        ) : (
          <Panel className="divide-y divide-q-border-subtle p-0">
            {snapshot.weeklyHistory.map((w) => (
              <div key={w.id} className="flex items-center justify-between px-4 py-3">
                <Typography as="span" variant="body-sm-medium" color="primary">
                  {w.week}
                  {w.perfect ? " · Perfect" : ""}
                </Typography>
                <Typography as="span" variant="label-sm-semi-bold" color="primary">
                  {w.score} pts
                </Typography>
              </div>
            ))}
          </Panel>
        )}
      </Section>
    </Page>
  );
}
