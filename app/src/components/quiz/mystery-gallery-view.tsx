import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Images } from "lucide-react";
import { Media } from "@higgsfield/quanta/media";
import { Tabs } from "@higgsfield/quanta/tabs";
import { Typography } from "@higgsfield/quanta/typography";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import { getMysteryGallery } from "@/lib/api/mystery.functions";
import { MYSTERY_CATEGORY_EMOJI, MYSTERY_CATEGORY_LABEL, type MysteryCategory } from "@/lib/quiz/mystery";

const LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Easy", 2: "Medium", 3: "Hard" };
const LEVEL_FILTERS = ["all", "1", "2", "3"] as const;
type LevelFilter = (typeof LEVEL_FILTERS)[number];

const CATEGORY_FILTERS = ["all", "world", "science", "mystery", "past", "culture"] as const;
type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

export function MysteryGalleryView() {
  const galleryQuery = useQuery({ queryKey: ["mystery-gallery"], queryFn: () => getMysteryGallery() });
  const items = galleryQuery.data ?? [];
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");

  const filtered = useMemo(
    () =>
      items
        .filter((item) => levelFilter === "all" || String(item.level) === levelFilter)
        .filter((item) => categoryFilter === "all" || item.category === categoryFilter),
    [items, levelFilter, categoryFilter],
  );

  return (
    <Page>
      <PageHeader
        eyebrow="AI Mystery Round"
        title="Gallery"
        description="Every mystery image from your games, revealed."
      />
      {items.length > 0 ? (
        <Section>
          <Panel className="flex items-center gap-3">
            <Typography as="span" variant="title-sm-semi-bold" color="primary">
              {items.length}
            </Typography>
            <Typography as="span" variant="caption-xs-medium" color="tertiary">
              mystery {items.length === 1 ? "image" : "images"} from your games
            </Typography>
          </Panel>
        </Section>
      ) : null}
      <Section>
        {items.length === 0 ? (
          <EmptyState icon={Images} title="No images yet" description="Play a Mystery Round to start filling this gallery." />
        ) : (
          <div className="flex flex-col gap-4">
            <Tabs.Root variant="segmented" value={levelFilter} onValueChange={(v) => setLevelFilter(v as LevelFilter)}>
              <Tabs.List>
                <Tabs.Tab value="all">All</Tabs.Tab>
                <Tabs.Tab value="1">Easy</Tabs.Tab>
                <Tabs.Tab value="2">Medium</Tabs.Tab>
                <Tabs.Tab value="3">Hard</Tabs.Tab>
              </Tabs.List>
            </Tabs.Root>
            <Tabs.Root variant="segmented" value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <Tabs.List>
                <Tabs.Tab value="all">All categories</Tabs.Tab>
                {CATEGORY_FILTERS.filter((c) => c !== "all").map((c) => (
                  <Tabs.Tab key={c} value={c}>
                    {MYSTERY_CATEGORY_EMOJI[c as MysteryCategory]} {MYSTERY_CATEGORY_LABEL[c as MysteryCategory]}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.Root>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {filtered.map((item) => (
                <div key={item.id} className="flex flex-col gap-1.5">
                  <Media.Root ratio="square" rounded="lg">
                    <Media.Image src={item.mediaUrl} alt={item.answer} fit="cover" />
                  </Media.Root>
                  <Typography as="span" variant="caption-sm-medium" color="primary" truncate>
                    {item.answer}
                  </Typography>
                  <Typography as="span" variant="caption-xs-regular" color="tertiary">
                    {LEVEL_LABEL[item.level]}
                    {item.category ? ` · ${MYSTERY_CATEGORY_EMOJI[item.category]} ${MYSTERY_CATEGORY_LABEL[item.category]}` : ""}
                  </Typography>
                </div>
              ))}
            </div>
          </div>
        )}
      </Section>
    </Page>
  );
}
