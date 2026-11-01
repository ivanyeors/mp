/**
 * The daily job's kept-sending Waves (PRD-campaign-audiences slice 10; ADR
 * 0040 (6)), chained onto `/api/cron/results-sla` (no third cron).
 *
 * For each campaign kept sending and not paused, oldest first: one Wave a day,
 * labelled `daily-YYYY-MM-DD`, through the same `planWave`,
 * `claim_marketing_campaign_send()` and `sendCampaignBatch` as a Staff Wave,
 * so consent, suppression and the Rest period apply exactly as there. It sends
 * at most the campaign's cap a day (counting what a re-run already claimed),
 * and never into the reserve Resend's room keeps for tests and Staff Waves.
 *
 * The day stops, for every campaign left, at: the room down to the reserve;
 * the pause rule (bounces or spam over the line on the last Wave of any
 * campaign); a 429 from Resend; or sending not set up. A campaign is paused,
 * saying why, when its Segments are not the ones a person approved, or its
 * email fails a check (a link that died, a product taken off the shop): both
 * need a person, and it stays paused until one resumes it. Each campaign's run
 * goes to the audit log as the system, with counts; one Telegram line carries
 * the day's counts, no names.
 *
 * Everything it touches outside the sender comes in `deps`, so tests pass
 * fakes; keep-sending-server.ts wires the real ones.
 */
import { isSendQuotaError } from "@/lib/customer-migration/wave-sender";
import { formatAdminDateTime } from "@/lib/format/admin-date";
import {
  KEEP_SENDING_RESERVE,
  campaignSegmentIds,
  keptWaveLabel,
  keptWaveSize,
  segmentChange,
  type LiveSegment,
} from "./keep-sending";
import type { Campaign } from "./rules";
import { CHECK_LABEL, isEmailCheck, rampUntil } from "./send-flow";
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
  /** Every campaign kept sending and not paused, oldest started first. */
  campaigns: () => Promise<Campaign[]>;
  /** Each of a campaign's Segments now: null for one that is gone. */
  liveSegments: (c: Campaign) => Promise<Map<string, LiveSegment | null>>;
  /** The Segment it is sent to, page by page, as a Staff Wave reads it. */
  audience: (c: Campaign) => (() => AsyncIterable<string[]>) | undefined;
  /** The Segments it leaves out, as a Staff Wave reads them. */
  exclusions: (c: Campaign) => Promise<CampaignExclusionSource[]>;
  /** Pauses the campaign, saying why, until a person resumes it. */
  pause: (campaignId: string, reason: string) => Promise<void>;
  /** One audit row, as the system. */
  audit: (campaignId: string, after: Record<string, unknown>) => Promise<void>;
  /** One line, counts only. */
  telegram?: (text: string) => Promise<unknown>;
  /** What the job leaves of the day's room; KEEP_SENDING_RESERVE when unset. */
  reserve?: number;
}

export interface KeptCampaignRun {
  campaignId: string;
  wave: string;
  sent: number;
  failed: number;
  /** Left out at the moment of sending, by reason (resting, unsubscribed since…). */
  skipped: Partial<Record<string, number>>;
  /** Who could get it today, before the cap and the room; null when it was not planned. */
  eligible: number | null;
  /** Why it sent nothing more today, in words; null when it sent everyone it could. */
  held: string | null;
  /** The run paused it: a person must look before it sends again. */
  paused: boolean;
}

export interface KeptSendingRun {
  ok: true;
  campaigns: KeptCampaignRun[];
  sent: number;
  /** Why the day stopped for every campaign left; null when it did not. */
  stoppedForDay: string | null;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The room less the reserve, now: what the next batch may use. */
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

      // The Audience a person approved, or none: a changed Segment pauses it.
      const changed = segmentChange(campaignSegmentIds(campaign), campaign.keepSending.segments, await deps.liveSegments(campaign));
      if (changed) {
        await pause(changed);
        continue;
      }
      // The first Wave's bounces and spam reports come in over two days: wait for them, as a person would.
      const ramp = rampUntil((await readWaveStats(setup.admin, campaign.id)).own, now.getTime());
      if (ramp) {
        out.held = `it waits until ${formatAdminDateTime(ramp)} for the first wave's bounces and spam reports`;
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
          // The email no longer passes (a link died, a product left the shop): a person must look.
          await pause(`the email failed a check: ${named(email)}`);
        } else {
          run.stoppedForDay = `sending is not ready: ${named(failing.filter((c) => !isEmailCheck(c)))}`;
          out.held = run.stoppedForDay;
        }
        continue;
      }

      // A batch at a time, each inside the room less the reserve as it is then: a Staff Wave may be sending too.
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
          // A 429 or the limit stops the day; anything else, this campaign's.
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

/** Pure — the day's Telegram line: counts only, no names (PRD hazard: no PII in Telegram). */
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
