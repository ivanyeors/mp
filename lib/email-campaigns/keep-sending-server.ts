import { recordAdminAction } from "@/lib/auth/audit";
import { sendTelegram } from "@/lib/telegram/notify";
import { runKeptSending, type KeptSendingRun } from "./keep-sending-run";
import { leftOutSegments, readLiveSegments, segmentAudience } from "./segment-sources";
import { campaignSenderSetup } from "./setup";
import { pauseKeptSending, readKeptSendingCampaigns } from "./store";

export const KEPT_SENDING_AUDIT_ACTION = "email_campaign.kept_sending";

export async function runKeptSendingFromEnv(now: Date): Promise<KeptSendingRun> {
  const setup = { ...campaignSenderSetup(), now: () => now };
  return runKeptSending({
    setup,
    campaigns: () => readKeptSendingCampaigns(setup.admin),
    liveSegments: (c) => readLiveSegments(c),
    audience: (c) => segmentAudience(c),
    exclusions: (c) => leftOutSegments(c.excludeSegmentIds),
    pause: (id, reason) => pauseKeptSending(setup.admin, id, reason, now),
    audit: (id, after) => recordAdminAction({ actor: null, action: KEPT_SENDING_AUDIT_ACTION, entityType: "email_campaign", entityId: id, after }),
    telegram: (text) => sendTelegram(text),
  });
}
