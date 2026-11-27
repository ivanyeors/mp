import { isSendQuotaError } from "@/lib/customer-migration/wave-sender";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import {
  KEEP_SENDING_RESERVE,
  campaignSegmentIds,
  keptRampUntil,
  keptWaveLabel,
  keptWaveSize,
  segmentChange,
  type LiveSegment,
} from "./keep-sending";
import type { Campaign } from "./rules";
import { keptRunAtOrAfter } from "./progress";
import { CHECK_LABEL, isEmailCheck } from "./send-flow";
import {
  BATCH_SIZE,
  planWave,
  readSendAllowance,
  sendCampaignBatch,
  type CampaignExclusionSource,
  type CampaignSenderSetup,
} from "./sender";
import { countWaveClaims, readWaveStats } from "./store";

export interface KeptSendingDeps {
  setup: CampaignSenderSetup;
  campaigns: () => Promise<Campaign[]>;
  liveSegments: (c: Campaign) => Promise<Map<string, LiveSegment | null>>;
  audience: (c: Campaign) => (() => AsyncIterable<string[]>) | undefined;
  exclusions: (c: Campaign) => Promise<CampaignExclusionSource[]>;
  pause: (campaignId: string, reason: string) => Promise<void>;
  audit: (campaignId: string, after: Record<string, unknown>) => Promise<void>;
  telegram?: (text: string) => Promise<unknown>;
  reserve?: number;
}

export interface KeptCampaignRun {
  campaignId: string;
  wave: string;
  sent: number;
  failed: number;
  skipped: Partial<Record<string, number>>;
  eligible: number | null;
  held: string | null;
  paused: boolean;
}

export interface KeptSendingRun {
  ok: true;
  campaigns: KeptCampaignRun[];
  sent: number;
  stoppedForDay: string | null;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

async function roomNow(setup: CampaignSenderSetup, reserve: number): Promise<number> {
  return Math.max(0, (await readSendAllowance(setup)).remaining - reserve);
}

export async function runKeptSending(deps: KeptSendingDeps): Promise<KeptSendingRun> {
  const { setup } = deps;
  const now = (setup.now ?? (() => new Date()))();
  const reserve = deps.reserve ?? KEEP_SENDING_RESERVE;
  const wave = keptWaveLabel(now);
  const run: KeptSendingRun = { ok: true, campaigns: [], sent: 0, stoppedForDay: null };
  const campaigns = await deps.campaigns();

  for (const campaign of campaigns) {
    const out: KeptCampaignRun = { campaignId: campaign.id, wave, sent: 0, failed: 0, skipped: {}, eligible: null, held: null, paused: false };
    run.campaigns.push(out);
    const pause = async (reason: string) => {
      out.held = reason;
      out.paused = true;
      await deps.pause(campaign.id, reason);
    };
    try {
      if (run.stoppedForDay) {
        out.held = run.stoppedForDay;
        continue;
      }
      const cap = campaign.keepSending?.dailyCap ?? 0;
      if (!campaign.keepSending?.on || campaign.keepSending.pausedAt) continue;

      const changed = segmentChange(campaignSegmentIds(campaign), campaign.keepSending.segments, await deps.liveSegments(campaign));
      if (changed) {
        await pause(changed);
        continue;
      }
      const ramp = keptRampUntil((await readWaveStats(setup.admin, campaign.id)).own, now.getTime());
      if (ramp) {
        out.held = `it waits until ${formatAdminDateTime(keptRunAtOrAfter(Date.parse(ramp)).toISOString())} for the first wave's bounces and spam reports`;
        continue;
      }

      const claimedToday = await countWaveClaims(setup.admin, campaign.id, wave);
      const allowance = await readSendAllowance(setup);
      const { size, limit } = keptWaveSize({ cap, claimedToday, remaining: allowance.remaining, reserve });
      if (limit === "cap") {
        out.held = `today's ${cap} are claimed`;
        continue;
      }
      if (limit === "room") {
        run.stoppedForDay = `Resend's room is down to the ${reserve} kept for tests and your own waves`;
        out.held = run.stoppedForDay;
        continue;
      }

      const plan = await planWave(campaign, { size }, setup, deps.audience(campaign), await deps.exclusions(campaign));
      out.eligible = plan.plan.eligible;
      if (!plan.readiness.ready) {
        const failing = plan.readiness.checks.filter((c) => !c.ok);
        const named = (keys: typeof failing) => keys.map((c) => `${CHECK_LABEL[c.key] ?? c.key}: ${c.detail}`).join("; ");
        const email = failing.filter(isEmailCheck);
        if (failing.some((c) => c.key === "pause")) {
          run.stoppedForDay = `the pause rule: ${failing.find((c) => c.key === "pause")!.detail}`;
          out.held = run.stoppedForDay;
        } else if (email.length && email.length === failing.length) {
          await pause(`the email failed a check: ${named(email)}`);
        } else {
          run.stoppedForDay = `sending is not ready: ${named(failing.filter((c) => !isEmailCheck(c)))}`;
          out.held = run.stoppedForDay;
        }
        continue;
      }

      const ids = plan.customerIds;
      let failuresInARow = 0;
      for (let i = 0; i < ids.length; ) {
        const room = await roomNow(setup, reserve);
        if (room === 0) {
          run.stoppedForDay = `Resend's room is down to the ${reserve} kept for tests and your own waves`;
          out.held = run.stoppedForDay;
          break;
        }
        const chunk = ids.slice(i, i + Math.min(BATCH_SIZE, room));
        i += chunk.length;
        const batch = await sendCampaignBatch(campaign, { wave, customerIds: chunk, failuresInARow }, setup);
        out.sent += batch.sent;
        out.failed += batch.failed;
        for (const [k, v] of Object.entries(batch.skipped)) out.skipped[k] = (out.skipped[k] ?? 0) + (v ?? 0);
        failuresInARow = batch.failuresInARow;
        if (batch.stopped) {
          const quota = batch.errors.some(isSendQuotaError) || /quota|send limit/i.test(batch.stopped);
          if (quota) run.stoppedForDay = `Resend stopped sending: ${batch.stopped}`;
          out.held = quota ? run.stoppedForDay : batch.stopped;
          break;
        }
      }
    } catch (err) {
      out.held = message(err);
    } finally {
      run.sent += out.sent;
      if (campaign.keepSending?.on && !campaign.keepSending.pausedAt) {
        await deps
          .audit(campaign.id, {
            wave,
            sent: out.sent,
            failed: out.failed,
            skipped: out.skipped,
            eligible: out.eligible,
            cap: campaign.keepSending.dailyCap,
            held: out.held,
            paused: out.paused,
          })
          .catch(() => undefined);
      }
    }
  }

  if (deps.telegram && run.campaigns.length) {
    await deps.telegram(keptSendingLine(run)).catch(() => undefined);
  }
  return run;
}

export function keptSendingLine(run: Pick<KeptSendingRun, "campaigns" | "sent" | "stoppedForDay">): string {
  const n = run.campaigns.length;
  const paused = run.campaigns.filter((c) => c.paused).length;
  const failed = run.campaigns.reduce((sum, c) => sum + c.failed, 0);
  const parts = [
    `Kept sending: ${run.sent} email${run.sent === 1 ? "" : "s"} today from ${n} campaign${n === 1 ? "" : "s"}`,
    failed ? `${failed} failed` : null,
    paused ? `${paused} paused, to look at in Email campaigns` : null,
    run.stoppedForDay ? `stopped early: ${run.stoppedForDay}` : null,
  ];
  return parts.filter(Boolean).join("; ") + ".";
}
