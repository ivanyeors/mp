/**
 * The campaign send ledger, `customer_campaign_sends`
 * (PRD-shopify-customer-migration slice 08; 20261020130000). Server only,
 * through the service role. Every write is a SQL function, as everywhere in
 * lib/customer-migration:
 *
 *  - `claim_campaign_send`: the rule and the row in one call, BEFORE sending.
 *    The unique key (Customer, template) is what makes a second run, or a
 *    concurrent one, skip that person.
 *  - `finish_campaign_send`: `sent` with the provider's id, or `failed`.
 *  - `record_campaign_send_event`: the webhook's bounce or complaint; a
 *    complaint also unsubscribes, source `complaint`.
 *
 * Campaign sends do not use `customer_emails` (slice 05): that ledger retries
 * failed transactional email by itself and knows nothing of waves, bounces or
 * complaints. The email-marketing initiative widens this ledger's template
 * check instead of building another.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_NOTICE_SETTING_KEY, type CampaignTemplate } from "./campaign";

export type CampaignClaim =
  | { claimed: true; sendId: string; email: string; firstName: string | null; locale: string }
  /** Not this run's to send: `blocker` says why (a rule reason, `already_sent`, `not_failed`, `service_notice_off`). */
  | { claimed: false; blocker: string }
  /** The claim itself failed; nothing was written. */
  | { claimed: false; error: string };

type ClaimRow = {
  send_id: string | null;
  blocker: string | null;
  email: string | null;
  first_name: string | null;
  locale: string | null;
};

/** Pure — `claim_campaign_send`'s one row as a claim. */
export function claimFromRow(data: unknown): CampaignClaim {
  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null | undefined;
  if (row?.send_id && typeof row.email === "string") {
    const firstName = typeof row.first_name === "string" && row.first_name.trim() ? row.first_name.trim() : null;
    return { claimed: true, sendId: row.send_id, email: row.email, firstName, locale: row.locale ?? "en-US" };
  }
  return { claimed: false, blocker: row?.blocker ?? "already_sent" };
}

/**
 * Claims one send. `claimed: true` means this run owns it and must finish it.
 * The SQL re-checks eligibility in the same call: someone who unsubscribed,
 * bounced or Claimed since the audience was selected is not claimed.
 */
export async function claimCampaignSend(
  admin: SupabaseClient,
  input: { customerId: string; template: CampaignTemplate; wave: string; retryFailed?: boolean },
): Promise<CampaignClaim> {
  const { data, error } = await admin.rpc("claim_campaign_send", {
    p_customer_id: input.customerId,
    p_template: input.template,
    p_wave: input.wave,
    p_retry_failed: input.retryFailed ?? false,
  });
  if (error) return { claimed: false, error: error.message };
  return claimFromRow(data);
}

/**
 * Marks a claimed send `sent` (with the provider's message id, which the
 * webhook finds it by) or `failed` (with the error). Returns false when the
 * row was not `pending`, or the call failed: the caller logs it, and the row
 * stays as it was, which for a pending row means it is never sent again.
 */
export async function finishCampaignSend(
  admin: SupabaseClient,
  input: { sendId: string; sent: boolean; providerMessageId?: string | null; error?: string | null },
): Promise<boolean> {
  const { data, error } = await admin.rpc("finish_campaign_send", {
    p_send_id: input.sendId,
    p_sent: input.sent,
    p_provider_message_id: input.providerMessageId ?? null,
    p_error: input.error ?? null,
  });
  if (error) {
    console.error(`[campaign] could not finish send ${input.sendId}:`, error.message);
    return false;
  }
  return data === true;
}

export type CampaignSendEventResult =
  | {
      ok: true;
      /** False: no campaign send has that message id (an order email, say). */
      found: boolean;
      changed: boolean;
      /** A complaint moved the Customer to `unsubscribed` just now. */
      unsubscribed: boolean;
    }
  | { ok: false; error: string };

/** A bounce or a complaint the provider reported, by its message id. */
export async function recordCampaignSendEvent(
  admin: SupabaseClient,
  input: { providerMessageId: string; event: "bounced" | "complained"; at?: string | null },
): Promise<CampaignSendEventResult> {
  const { data, error } = await admin.rpc("record_campaign_send_event", {
    p_provider_message_id: input.providerMessageId,
    p_event: input.event,
    p_at: input.at ?? null,
  });
  if (error) return { ok: false, error: error.message };
  const row = (Array.isArray(data) ? data[0] : data) as
    | { send_id: string | null; changed: boolean | null; unsubscribed: boolean | null }
    | null
    | undefined;
  if (!row?.send_id) return { ok: true, found: false, changed: false, unsubscribed: false };
  return { ok: true, found: true, changed: row.changed === true, unsubscribed: row.unsubscribed === true };
}

/** Owner decision 3: may the no-consent group get the service notice? Off unless the setting says 'true'. */
export async function readServiceNoticeEnabled(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", SERVICE_NOTICE_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(`Could not read ${SERVICE_NOTICE_SETTING_KEY}: ${error.message}`);
  return String((data as { value?: unknown } | null)?.value ?? "").trim().toLowerCase() === "true";
}

// ─── Waves ───────────────────────────────────────────────────────────────────

/** One wave's numbers (`customer_campaign_wave_stats`). */
export interface CampaignWaveStats {
  template: string;
  wave: string;
  /** Accepted by the provider: sent, bounced or complained. */
  handed: number;
  bounced: number;
  complained: number;
  failed: number;
  pending: number;
  lastSentAt: string | null;
}

/** The PRD's pause rule: bounces past 2%, or complaints past 0.1%, of what a wave handed over. */
export const PAUSE_BOUNCE_RATE = 0.02;
export const PAUSE_COMPLAINT_RATE = 0.001;

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

/** Pure — the view's rows. */
export function waveStatsFromRows(rows: readonly Record<string, unknown>[]): CampaignWaveStats[] {
  return rows.map((r) => ({
    template: String(r.template ?? ""),
    wave: String(r.wave ?? ""),
    handed: n(r.handed),
    bounced: n(r.bounced),
    complained: n(r.complained),
    failed: n(r.failed),
    pending: n(r.pending),
    lastSentAt: typeof r.last_sent_at === "string" ? r.last_sent_at : null,
  }));
}

export async function readCampaignWaveStats(admin: SupabaseClient): Promise<CampaignWaveStats[]> {
  const { data, error } = await admin
    .from("customer_campaign_wave_stats")
    .select("template, wave, handed, bounced, complained, failed, pending, last_sent_at");
  if (error) throw new Error(`Could not read the campaign's waves: ${error.message}`);
  return waveStatsFromRows((data ?? []) as Record<string, unknown>[]);
}

export type WavePause = { paused: false } | { paused: true; wave: string; template: string; reason: string };

/**
 * Pure — does the most recent wave (by its last accepted send, any template)
 * hold a pause condition? Mailbox providers judge the sender, not the
 * template, so one wave's bounces pause every template until a human has
 * looked at that segment and resumes.
 */
export function wavePause(stats: readonly CampaignWaveStats[]): WavePause {
  const latest = stats
    .filter((s) => s.handed > 0 && s.lastSentAt)
    .sort((a, b) => Date.parse(b.lastSentAt!) - Date.parse(a.lastSentAt!))[0];
  if (!latest) return { paused: false };
  const pct = (part: number) => `${((part / latest.handed) * 100).toFixed(1)}%`;
  if (latest.bounced / latest.handed > PAUSE_BOUNCE_RATE) {
    return {
      paused: true,
      wave: latest.wave,
      template: latest.template,
      reason: `${latest.bounced} of ${latest.handed} bounced (${pct(latest.bounced)}, over 2%)`,
    };
  }
  if (latest.complained / latest.handed > PAUSE_COMPLAINT_RATE) {
    return {
      paused: true,
      wave: latest.wave,
      template: latest.template,
      reason: `${latest.complained} of ${latest.handed} complained (${pct(latest.complained)}, over 0.1%)`,
    };
  }
  return { paused: false };
}

// ─── The send limit ──────────────────────────────────────────────────────────

/** Statuses that used up one of the provider's sends, or may have: a pending row may have gone. */
export const COUNTED_SEND_STATUSES = ["pending", "sent", "bounced", "complained"] as const;

/**
 * The windows the limits are counted over. Rolling, and a little wider than
 * a calendar day or month, so they hold at least what Resend counts however
 * it draws its own day and billing month.
 */
export const SEND_LIMIT_DAY_MS = 24 * 3600_000;
export const SEND_LIMIT_MONTH_MS = 31 * 86400_000;

export interface RecentCampaignSends {
  lastDay: number;
  lastMonth: number;
}

/** Campaign sends in the last 24 hours and the last 31 days, every template and wave. */
export async function readRecentCampaignSends(admin: SupabaseClient, now: Date): Promise<RecentCampaignSends> {
  const since = async (ms: number) => {
    const { count, error } = await admin
      .from("customer_campaign_sends")
      .select("id", { count: "exact", head: true })
      .in("status", [...COUNTED_SEND_STATUSES])
      .gte("sent_at", new Date(now.getTime() - ms).toISOString());
    if (error) throw new Error(`Could not count the campaign's recent sends: ${error.message}`);
    return count ?? 0;
  };
  const [lastDay, lastMonth] = await Promise.all([since(SEND_LIMIT_DAY_MS), since(SEND_LIMIT_MONTH_MS)]);
  return { lastDay, lastMonth };
}

export interface SendBudget {
  /** How many more this run may send. */
  remaining: number;
  /** The limit that leaves the least room. */
  binding: "daily" | "monthly";
}

/** Pure — what the limits leave for this run. */
export function sendBudget(limits: { daily: number; monthly: number }, used: RecentCampaignSends): SendBudget {
  const daily = Math.max(0, limits.daily - used.lastDay);
  const monthly = Math.max(0, limits.monthly - used.lastMonth);
  return daily <= monthly ? { remaining: daily, binding: "daily" } : { remaining: monthly, binding: "monthly" };
}
