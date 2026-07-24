import { useQuery } from "@tanstack/react-query";
import { Swords } from "lucide-react";
import { Button } from "@higgsfield/quanta/button";
import { Typography } from "@higgsfield/quanta/typography";
import { EmptyState, Page, PageHeader, Panel, Section } from "@/components/custom-ui";
import { getMyChallengesFn } from "@/lib/api/challenge.functions";

function statusLabel(c: { expired: boolean; done: boolean; waitingOnMe: boolean }): string {
  if (c.done) return "Results ready";
  if (c.expired) return "Expired";
  if (c.waitingOnMe) return "Your turn";
  return "Waiting for opponent";
}

export function ChallengeInboxView({
  onOpenChallenge,
  onNewChallenge,
}: {
  onOpenChallenge: (id: string) => void;
  onNewChallenge: () => void;
}) {
  const query = useQuery({ queryKey: ["my-challenges"], queryFn: () => getMyChallengesFn() });
  const challenges = query.data ?? [];

  return (
    <Page>
      <PageHeader eyebrow="Challenge" title="Your challenges" description="Sent and received, live and past." />
      <Section>
        <Button variant="marketingPrimary" size="sm" start={<Swords className="size-4" aria-hidden />} onClick={onNewChallenge}>
          New challenge
        </Button>
      </Section>
      <Section>
        {challenges.length === 0 ? (
          <EmptyState icon={Swords} title="No challenges yet" description="Challenge a friend to a head-to-head match." />
        ) : (
          <div className="flex flex-col gap-2">
            {challenges.map((c) => (
              <button key={c.id} type="button" onClick={() => onOpenChallenge(c.id)} className="text-left">
                <Panel className="flex items-center justify-between transition-colors hover:bg-q-background-tertiary">
                  <div className="flex flex-col gap-0.5">
                    <Typography as="span" variant="body-sm-medium" color="primary">
                      {c.opponentName ?? (c.isCreator ? "Waiting for opponent" : "Challenge")}
                    </Typography>
                    <Typography as="span" variant="caption-xs-regular" color="tertiary">
                      {statusLabel(c)} · {c.isCreator ? "You sent this" : "You were challenged"}
                    </Typography>
                  </div>
                </Panel>
              </button>
            ))}
          </div>
        )}
      </Section>
    </Page>
  );
}
