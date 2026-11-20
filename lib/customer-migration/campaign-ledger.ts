import type { SupabaseClient } from "@supabase/supabase-js";
import { SERVICE_NOTICE_SETTING_KEY, type CampaignTemplate } from "./campaign";

export type CampaignClaim =
  | { claimed: true; sendId: string; email: string; firstName: string | null; locale: string }
  | { claimed: false; blocker: string }
  | { claimed: false; error: string };

type ClaimRow = {
  send_id: string | null;
  blocker: string | null;
  email: string | null;
  first_name: string | null;
  locale: string | null;
};

export function claimFromRow(data: unknown): CampaignClaim {
  const row = (Array.isArray(data) ? data[0] : data) as ClaimRow | null | undefined;
  if (row?.send_id && typeof row.email === "string") {
    const firstName = typeof row.first_name === "string" && row.first_name.trim() ? row.first_name.trim() : null;
    return { claimed: true, sendId: row.send_id, email: row.email, firstName, locale: row.locale ?? "en-US" };
  }
  return { claimed: false, blocker: row?.blocker ?? "already_sent" };
}

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

export async function finishCampaignSend(
  admin: SupabaseClient,
  input: {
    sendId: string;
    sent: boolean;
    providerMessageId?: string | null;
    error?: string | null;
    clickTokenHash?: string | null;
  },
): Promise<boolean> {
  const { data, error } = await admin.rpc("finish_campaign_send", {
    p_send_id: input.sendId,
    p_sent: input.sent,
    p_provider_message_id: input.providerMessageId ?? null,
    p_error: input.error ?? null,
    ...(input.clickTokenHash ? { p_click_token_hash: input.clickTokenHash } : {}),
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
      found: boolean;
      changed: boolean;
      unsubscribed: boolean;
    }
  | { ok: false; error: string };

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

export async function readServiceNoticeEnabled(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", SERVICE_NOTICE_SETTING_KEY)
    .maybeSingle();
  if (error) throw new Error(`Could not read ${SERVICE_NOTICE_SETTING_KEY}: ${error.message}`);
  return String((data as { value?: unknown } | null)?.value ?? "").trim().toLowerCase() === "true";
}

export interface CampaignWaveStats {
  template: string;
  wave: string;
  handed: number;
  bounced: number;
  complained: number;
  failed: number;
  pending: number;
  lastSentAt: string | null;
}

export const PAUSE_BOUNCE_RATE = 0.02;
export const PAUSE_COMPLAINT_RATE = 0.001;

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

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

export const COUNTED_SEND_STATUSES = ["pending", "sent", "bounced", "complained"] as const;

export const SEND_LIMIT_DAY_MS = 24 * 3600_000;
export const SEND_LIMIT_MONTH_MS = 31 * 86400_000;

export interface RecentCampaignSends {
  lastDay: number;
  lastMonth: number;
  oldestInDay?: string | null;
  oldestInMonth?: string | null;
}

export const CAMPAIGN_TEST_AUDIT_ACTION = "email_campaign.test";

const earliest = (...isos: (string | null | undefined)[]) =>
  isos.filter((t): t is string => Boolean(t) && Number.isFinite(Date.parse(t!))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

export async function readRecentCampaignSends(admin: SupabaseClient, now: Date): Promise<RecentCampaignSends> {
  const sinceIso = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const used = () =>
    admin.from("customer_campaign_sends").select("sent_at", { count: "exact", head: true }).in("status", [...COUNTED_SEND_STATUSES]);
  const count = async (ms: number) => {
    const { count, error } = await used().gte("sent_at", sinceIso(ms));
    if (error) throw new Error(`Could not count the campaign's recent sends: ${error.message}`);
    return count ?? 0;
  };
  const oldest = async (ms: number) => {
    const { data, error } = await admin
      .from("customer_campaign_sends")
      .select("sent_at")
      .in("status", [...COUNTED_SEND_STATUSES])
      .gte("sent_at", sinceIso(ms))
      .order("sent_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(`Could not read the campaign's recent sends: ${error.message}`);
    const at = (data as { sent_at?: unknown }[] | null)?.[0]?.sent_at;
    return typeof at === "string" ? at : null;
  };
  const tests = async () => {
    const { data, error } = await admin
      .from("admin_audit_log")
      .select("created_at, after")
      .eq("action", CAMPAIGN_TEST_AUDIT_ACTION)
      .gte("created_at", sinceIso(SEND_LIMIT_MONTH_MS));
    if (error) throw new Error(`Could not count the campaign's test sends: ${error.message}`);
    return ((data ?? []) as { created_at?: unknown; after?: unknown }[]).flatMap((row) => {
      const sent = Number((row.after as { sent?: unknown } | null)?.sent);
      return typeof row.created_at === "string" && Number.isInteger(sent) && sent > 0 ? [{ at: row.created_at, sent }] : [];
    });
  };

  const [lastDay, lastMonth, oldestDay, oldestMonth, testRows] = await Promise.all([
    count(SEND_LIMIT_DAY_MS),
    count(SEND_LIMIT_MONTH_MS),
    oldest(SEND_LIMIT_DAY_MS),
    oldest(SEND_LIMIT_MONTH_MS),
    tests(),
  ]);
  const daySince = now.getTime() - SEND_LIMIT_DAY_MS;
  const testsInDay = testRows.filter((t) => Date.parse(t.at) >= daySince);
  const sum = (rows: { sent: number }[]) => rows.reduce((a, t) => a + t.sent, 0);
  return {
    lastDay: lastDay + sum(testsInDay),
    lastMonth: lastMonth + sum(testRows),
    oldestInDay: earliest(oldestDay, ...testsInDay.map((t) => t.at)),
    oldestInMonth: earliest(oldestMonth, ...testRows.map((t) => t.at)),
  };
}

export interface SendBudget {
  remaining: number;
  binding: "daily" | "monthly";
}

export function sendBudget(limits: { daily: number; monthly: number }, used: RecentCampaignSends): SendBudget {
  const daily = Math.max(0, limits.daily - used.lastDay);
  const monthly = Math.max(0, limits.monthly - used.lastMonth);
  return daily <= monthly ? { remaining: daily, binding: "daily" } : { remaining: monthly, binding: "monthly" };
}

export interface SendAllowance extends SendBudget {
  limits: { daily: number; monthly: number };
  used: { daily: number; monthly: number };
  roomAt: string | null;
}

export function sendAllowance(limits: { daily: number; monthly: number }, recent: RecentCampaignSends): SendAllowance {
  const budget = sendBudget(limits, recent);
  const oldest = budget.binding === "daily" ? recent.oldestInDay : recent.oldestInMonth;
  const window = budget.binding === "daily" ? SEND_LIMIT_DAY_MS : SEND_LIMIT_MONTH_MS;
  return {
    ...budget,
    limits: { daily: limits.daily, monthly: limits.monthly },
    used: { daily: recent.lastDay, monthly: recent.lastMonth },
    roomAt: budget.remaining === 0 && oldest ? new Date(Date.parse(oldest) + window).toISOString() : null,
  };
}
