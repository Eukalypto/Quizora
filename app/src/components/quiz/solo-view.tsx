import { useMemo, useState } from "react";
import { CalendarDays, Shuffle, Sparkles } from "lucide-react";
import { Button } from "@higgsfield/quanta/button";
import { Typography } from "@higgsfield/quanta/typography";
import { Page, PageHeader, Panel, Section, VolumetricIconTile } from "@/components/custom-ui";
import { CategoryPicker, DifficultyTabs } from "@/components/quiz/category-picker";
import { ALL_CATEGORIES } from "@/lib/category-list";
import type { Category, Difficulty } from "@/lib/categories";
import { isoWeek, todayIso } from "@/lib/quiz/scoring";
import type { UserSnapshot } from "@/lib/quiz/types";

/** Shown both next to the difficulty tabs and again below the category grid
 * — same button, same state, just duplicated for reachability at either
 * scroll position. */
function PlayFreePlayButton({
  selectedCategory,
  difficulty,
  onStartFreePlay,
  className,
}: {
  selectedCategory: Category | null;
  difficulty: Difficulty;
  onStartFreePlay: (categoryKey: string, difficulty: Difficulty) => void;
  className?: string;
}) {
  return (
    <Button
      variant="primary"
      size="md"
      className={className}
      disabled={!selectedCategory}
      onClick={() => selectedCategory && onStartFreePlay(selectedCategory.key, difficulty)}
    >
      {selectedCategory ? `Play ${selectedCategory.label}` : "Choose a category"}
    </Button>
  );
}

export function SoloView({
  snapshot,
  onStartDaily,
  onStartWeekly,
  onStartFreePlay,
}: {
  snapshot: UserSnapshot;
  onStartDaily: () => void;
  onStartWeekly: () => void;
  onStartFreePlay: (categoryKey: string, difficulty: Difficulty) => void;
}) {
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [categoryKey, setCategoryKey] = useState<string | null>(null);

  const dailyDoneToday = snapshot.dailyDone === todayIso();
  const weeklyDoneThisWeek = snapshot.weeklyDone === isoWeek();

  const selectedCategory = useMemo(
    () => ALL_CATEGORIES.find((c) => c.key === categoryKey) ?? null,
    [categoryKey],
  );

  return (
    <Page>
      <PageHeader eyebrow="Solo" title="Solo game" description="Daily, weekly, or play any category on your own." />

      <Section title="Daily challenge">
        <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <VolumetricIconTile icon={CalendarDays} size="md" />
            <div className="flex flex-col gap-0.5">
              <Typography as="span" variant="body-md-medium" color="primary">
                {dailyDoneToday ? "Come back tomorrow" : "Today's daily challenge"}
              </Typography>
              <Typography as="span" variant="caption-sm-regular" color="tertiary">
                {snapshot.streak > 0 ? `🔥 ${snapshot.streak}-day streak` : "12 questions across every category"}
              </Typography>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled={dailyDoneToday} onClick={onStartDaily}>
            {dailyDoneToday ? "Done for today" : "Play"}
          </Button>
        </Panel>
      </Section>

      <Section title="Weekly challenge">
        <Panel className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <VolumetricIconTile icon={Sparkles} size="md" />
            <div className="flex flex-col gap-0.5">
              <Typography as="span" variant="body-md-medium" color="primary">
                {weeklyDoneThisWeek ? "Come back next week" : "This week's challenge"}
              </Typography>
              <Typography as="span" variant="caption-sm-regular" color="tertiary">
                Same 12 questions for everyone this week
              </Typography>
            </div>
          </div>
          <Button variant="secondary" size="sm" disabled={weeklyDoneThisWeek} onClick={onStartWeekly}>
            {weeklyDoneThisWeek ? "Done this week" : "Play"}
          </Button>
        </Panel>
      </Section>

      <Section
        title="Free play"
        description="Pick a category and difficulty."
        actions={<Shuffle className="size-4 text-q-icon-tertiary" aria-hidden />}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <DifficultyTabs value={difficulty} onChange={setDifficulty} />
            <PlayFreePlayButton selectedCategory={selectedCategory} difficulty={difficulty} onStartFreePlay={onStartFreePlay} />
          </div>
          <CategoryPicker
            categories={ALL_CATEGORIES}
            selectedKeys={categoryKey ? [categoryKey] : []}
            onToggle={(key) => setCategoryKey((current) => (current === key ? null : key))}
          />
          <PlayFreePlayButton selectedCategory={selectedCategory} difficulty={difficulty} onStartFreePlay={onStartFreePlay} className="self-start" />
        </div>
      </Section>
    </Page>
  );
}
