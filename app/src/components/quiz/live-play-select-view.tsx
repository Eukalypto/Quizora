import { Swords, Users } from "lucide-react";
import { Typography } from "@higgsfield/quanta/typography";
import { Page, PageHeader, Panel, Section, VolumetricIconTile } from "@/components/custom-ui";
import type { MultiplayerVariant } from "@/components/quiz/multiplayer-view";

export function LivePlaySelectView({ onSelect }: { onSelect: (variant: MultiplayerVariant) => void }) {
  return (
    <Page>
      <PageHeader eyebrow="Live Play" title="How are you playing?" description="Same device, pass and play — pick a format." />
      <Section>
        <div className="grid gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => onSelect("duo")} className="text-left">
            <Panel className="flex h-full flex-col items-center gap-3 text-center transition-colors hover:bg-q-background-tertiary">
              <VolumetricIconTile icon={Swords} size="lg" />
              <Typography as="span" variant="title-sm-semi-bold" color="primary">
                Duo
              </Typography>
              <Typography as="span" variant="caption-sm-regular" color="secondary">
                Head-to-head, just the two of you.
              </Typography>
            </Panel>
          </button>
          <button type="button" onClick={() => onSelect("teams")} className="text-left">
            <Panel className="flex h-full flex-col items-center gap-3 text-center transition-colors hover:bg-q-background-tertiary">
              <VolumetricIconTile icon={Users} size="lg" />
              <Typography as="span" variant="title-sm-semi-bold" color="primary">
                Teams
              </Typography>
              <Typography as="span" variant="caption-sm-regular" color="secondary">
                Split into 2-6 teams and battle it out.
              </Typography>
            </Panel>
          </button>
        </div>
      </Section>
    </Page>
  );
}
