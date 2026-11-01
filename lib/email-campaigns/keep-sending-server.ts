import { recordAdminAction } from "@/lib/auth/audit";
import { sendTelegram } from "@/lib/telegram/notify";
import { runKeptSending, type KeptSendingRun } from "./keep-sending-run";
import { leftOutSegments, readLiveSegments, segmentAudience } from "./segment-sources";
import { campaignSenderSetup } from "./setup";
import { pauseKeptSending, readKeptSendingCampaigns } from "./store";

/** The audit action of one campaign's daily run. */
export const KEPT_SENDING_AUDIT_ACTION = "email_campaign.kept_sending";

/**
 * The daily job's kept-sending Waves with this deployment's setup
 * (PRD-campaign-audiences slice 10): the campaign sender's Resend setup, the
 * Segments as a Staff Wave reads them, the audit log as the system (no
 * actor), and the ops Telegram chat. Called by `/api/cron/results-sla`.
 */
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
