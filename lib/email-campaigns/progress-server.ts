import type { SupabaseClient } from "@supabase/supabase-js";
import { campaignProgress, type CampaignProgress } from "./progress";
import { excludeSegmentMembers, stillToSend } from "./rules";
import { leftOutSegments, segmentAudience } from "./segment-sources";
import { rampUntil } from "./send-flow";
import { readExclusions } from "./sender";
import { readCampaignCandidates, readWaveStats, type CampaignListItem } from "./store";

export type ProgressAnswer = CampaignProgress | { error: string };

export async function readCampaignProgress(
  admin: SupabaseClient,
  items: readonly CampaignListItem[],
  { now, dailyLimit }: { now: Date; dailyLimit: number | null },
): Promise<Map<string, ProgressAnswer>> {
  // ponytail: reads each started campaign's whole audience on every page load; fine for tens of campaigns over a few thousand customers. Past that, count who is left in a SQL view.
  const started = items.filter((i) => i.campaign.lockedAt);
  const answers = await Promise.all(
    started.map(async ({ campaign, stats }): Promise<[string, ProgressAnswer]> => {
      try {
        const [audience, leaveOut, waves] = await Promise.all([
          readCampaignCandidates(admin, campaign, segmentAudience(campaign)),
          leftOutSegments(campaign.excludeSegmentIds).then(readExclusions),
          readWaveStats(admin, campaign.id),
        ]);
        const left = stillToSend(campaign.audience, excludeSegmentMembers(audience, leaveOut).candidates, {
          now,
          holdout: Boolean(campaign.keepSending?.holdoutAt),
          includeUnengaged: campaign.includeUnengaged,
        });
        return [
          campaign.id,
          campaignProgress({ sent: stats.handed, left, keepSending: campaign.keepSending, rampUntil: rampUntil(waves.own, now.getTime()), dailyLimit, now }),
        ];
      } catch (err) {
        return [campaign.id, { error: err instanceof Error ? err.message : String(err) }];
      }
    }),
  );
  return new Map(answers);
}
