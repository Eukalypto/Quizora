import { CalendarClock, Gamepad2 } from "lucide-react";
import { Typography } from "@higgsfield/quanta/typography";
import { EmptyState, Page, PageHeader, Panel, Section, VolumetricIconTile } from "@/components/custom-ui";
import type { HistoryEntry } from "@/lib/quiz/types";

function groupByDate(entries: HistoryEntry[]) {
  const groups = new Map<string, HistoryEntry[]>();
  for (const entry of entries) {
    const day = entry.playedAt.slice(0, 10);
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day)!.push(entry);
  }
  return [...groups.entries()];
}

export function HistoryView({ history }: { history: HistoryEntry[] }) {
  const groups = groupByDate(history);

  return (
    <Page>
      <PageHeader eyebrow="Profile" title="History" description="Every game you've played, most recent first." />
      <Section>
        {history.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="No games yet"
            description="Play a daily challenge or free play round to start building your history."
          />
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map(([day, entries]) => (
              <div key={day} className="flex flex-col gap-2">
                <Typography as="h3" variant="caption-sm-medium" color="tertiary">
                  {new Date(day).toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                </Typography>
                <Panel className="divide-y divide-q-border-subtle p-0">
                  {entries.map((entry) => (
                    <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
                      <VolumetricIconTile icon={Gamepad2} size="sm" />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <Typography as="span" variant="body-sm-medium" color="primary" truncate>
                          {entry.mode === "daily"
                            ? "Daily challenge"
                            : entry.mode === "weekly"
                              ? "Weekly challenge"
                              : (entry.categoryLabel ?? "Free play")}
                        </Typography>
                        <Typography as="span" variant="caption-sm-regular" color="tertiary">
                          {entry.correct} / {entry.total} correct
                          {entry.perfect ? " · Perfect!" : ""}
                        </Typography>
                      </div>
                      <Typography as="span" variant="label-sm-semi-bold" color="primary">
                        {entry.score}
                      </Typography>
                    </div>
                  ))}
                </Panel>
              </div>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
