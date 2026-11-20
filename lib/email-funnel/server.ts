import type { SupabaseClient } from "@supabase/supabase-js";
import { CHECKUP_TEMPLATE_LIKE } from "@/lib/aftercare/checkup";
import { readAftercareSettings } from "@/lib/aftercare/card-server";
import { readCheckupFee } from "@/lib/aftercare/checkup-server";
import { checkupBlock, DEFAULT_CHECKUP_SETTINGS } from "@/lib/aftercare/checkup";
import { DEFAULT_REVIEW_REQUEST_SETTINGS, REVIEW_REQUEST_TEMPLATE, reviewRequestBlock } from "@/lib/aftercare/review-request";
import { countLinkedGoogleReviewsOfRequested } from "@/lib/aftercare/review-request-counts";
import { DEFAULT_CUSTOMER_FILTERS } from "@/lib/crm/customer-filters";
import type { LifecycleStage } from "@/lib/crm/lifecycle-stage";
import { getLifecycleSummary } from "@/lib/crm/lifecycle-summary-server";
import { countCustomers, listSegments } from "@/lib/crm/segments";
import { DRAFT_REMINDERS, DRAFT_REMINDERS_ENABLED_KEY, emailKey, parseDraftRemindersEnabled } from "@/lib/draft-reminders";
import { listCampaigns } from "@/lib/email-campaigns/store";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buildFunnel, type AutomaticCount, type FunnelFacts, type FunnelPart, type FunnelView } from "./model";
import { daysWords, FUNNEL_STAGES } from "./programme";

const PAGE = 1000;
const CHUNK = 150;

type Query = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
type Rangeable = Query & { range(from: number, to: number): Query };
type Counted = PromiseLike<{ count: number | null; error: { message: string } | null }>;

async function readAll<T>(label: string, build: () => Rangeable): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw new Error(`${label}: ${error.message}`);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

async function readIn<T>(label: string, ids: readonly string[], build: (chunk: string[]) => Query): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await build(ids.slice(i, i + CHUNK));
    if (error) throw new Error(`${label}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
  }
  return out;
}

async function headCount(label: string, query: Counted): Promise<number> {
  const { count, error } = await query;
  if (error) throw new Error(`${label}: ${error.message}`);
  return count ?? 0;
}

const logFailed = (part: string, e: unknown) =>
  console.error(`[email-funnel] ${part} not read:`, e instanceof Error ? e.message : e);

async function orElse<T>(part: string, p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch (e) {
    logFailed(part, e);
    return fallback;
  }
}

type DraftRow = { id: string; status: string | null; customer_email: string | null; created_at: string };
type ResultRow = { customer_email: string | null; created_at: string };

export function countDraftsFinished(drafts: readonly DraftRow[], results: readonly ResultRow[]): number {
  const latest = new Map<string, string>();
  for (const r of results) {
    if (!r.customer_email) continue;
    const key = emailKey(r.customer_email);
    const seen = latest.get(key);
    if (!seen || r.created_at > seen) latest.set(key, r.created_at);
  }
  return drafts.filter((d) => {
    if (d.status != null) return true;
    const started = d.customer_email ? latest.get(emailKey(d.customer_email)) : undefined;
    return started !== undefined && Date.parse(started) >= Date.parse(d.created_at);
  }).length;
}

const sentEmails = (admin: SupabaseClient) =>
  admin.from("customer_emails").select("id", { count: "exact", head: true }).eq("status", "sent");

async function draftReminderCount(admin: SupabaseClient): Promise<AutomaticCount> {
  const templates = DRAFT_REMINDERS.map((r) => r.template);
  const perReminder = await Promise.all(
    DRAFT_REMINDERS.map((r) => headCount(r.template, sentEmails(admin).eq("template", r.template))),
  );
  const ledger = await readAll<{ id: string; entity_id: string }>("draft reminder sends", () =>
    admin.from("customer_emails").select("id, entity_id").in("template", templates).eq("status", "sent").order("id"),
  );
  const draftIds = [...new Set(ledger.map((r) => r.entity_id))];
  const drafts = await readIn<DraftRow>("reminded drafts", draftIds, (chunk) =>
    admin.from("mp_config_responses").select("id, status, customer_email, created_at").in("id", chunk),
  );
  const firstStarted = drafts.reduce<string | null>((min, d) => (min === null || d.created_at < min ? d.created_at : min), null);
  const results =
    firstStarted === null
      ? []
      : await readAll<ResultRow & { id: string }>("results", () =>
          admin
            .from("mp_config_responses")
            .select("id, customer_email, created_at")
            .not("status", "is", null)
            .not("customer_email", "is", null)
            .gte("created_at", firstStarted)
            .order("id"),
        );
  return {
    sent: perReminder.reduce((a, b) => a + b, 0),
    sentLabel: "Emails sent",
    outcome: countDraftsFinished(drafts, results),
    also: [
      { label: "Drafts reminded", count: draftIds.length },
      ...DRAFT_REMINDERS.map((r, i) => ({ label: `After ${daysWords(r.afterDays)}`, count: perReminder[i] })),
    ],
  };
}

async function reviewRequestCount(admin: SupabaseClient): Promise<AutomaticCount> {
  const asked = () => admin.from("customer_review_requests").select("customer_id", { count: "exact", head: true });
  const [sent, requests, opened, linked] = await Promise.all([
    headCount("review request emails", sentEmails(admin).eq("template", REVIEW_REQUEST_TEMPLATE)),
    headCount("customer_review_requests", asked()),
    headCount("customer_review_requests opened", asked().not("first_clicked_at", "is", null)),
    countLinkedGoogleReviewsOfRequested(admin),
  ]);
  return {
    sent: requests,
    sentLabel: "Customers asked, by email or WhatsApp",
    outcome: opened,
    also: [
      { label: "By email", count: sent },
      { label: "Reviews linked", count: linked },
    ],
  };
}

type CheckupSent = { customer_id: string; template: string; entity_id: string; sent_at: string };

export function summariseFunnelCheckups(input: {
  email: readonly CheckupSent[];
  whatsapp: readonly CheckupSent[];
  bookings: ReadonlyArray<{ customer_id: string; created_at: string; status: string }>;
}): { sent: number; byEmail: number; followedByBooking: number } {
  const first = new Map<string, { customerId: string; at: number }>();
  for (const row of [...input.email, ...input.whatsapp]) {
    const key = `${row.customer_id}|${row.template}|${row.entity_id}`;
    const at = Date.parse(row.sent_at);
    const prev = first.get(key);
    if (!prev || at < prev.at) first.set(key, { customerId: row.customer_id, at });
  }
  const byCustomer = new Map<string, number[]>();
  for (const { customerId, at } of first.values()) byCustomer.set(customerId, [...(byCustomer.get(customerId) ?? []), at]);
  const credited = new Set<string>();
  for (const b of input.bookings) {
    if (!BOOKED.includes(b.status)) continue;
    const t = Date.parse(b.created_at);
    const before = (byCustomer.get(b.customer_id) ?? []).filter((at) => at <= t);
    if (before.length) credited.add(`${b.customer_id}|${Math.max(...before)}`);
  }
  const emailed = new Set(input.email.map((r) => `${r.customer_id}|${r.template}|${r.entity_id}`));
  return { sent: first.size, byEmail: emailed.size, followedByBooking: credited.size };
}

const BOOKED = ["booked", "attended", "no_show", "needs_reschedule"];

async function checkupCount(admin: SupabaseClient): Promise<AutomaticCount> {
  type SentRow = { id: string; customer_id: string; template: string; entity_id: string; sent_at: string };
  const sent = (table: "customer_emails" | "customer_whatsapp") =>
    readAll<SentRow>(`check-up ${table}`, () =>
      admin
        .from(table)
        .select("id, customer_id, template, entity_id, sent_at")
        .like("template", CHECKUP_TEMPLATE_LIKE)
        .eq("status", "sent")
        .order("id"),
    );
  const [email, whatsapp, bookings] = await Promise.all([
    sent("customer_emails"),
    sent("customer_whatsapp"),
    // ponytail: every booking, paged, rather than an IN list of the reminded; a few thousand rows at most.
    // Upgrade: a SQL view counting check-ups followed by a booking.
    readAll<{ id: string; customer_id: string; created_at: string; status: string }>("readjustment_bookings", () =>
      admin.from("readjustment_bookings").select("id, customer_id, created_at, status").in("status", BOOKED).order("id"),
    ),
  ]);
  const s = summariseFunnelCheckups({ email, whatsapp, bookings });
  return {
    sent: s.sent,
    sentLabel: "Check-ups sent, by email or WhatsApp",
    outcome: s.followedByBooking,
    also: [{ label: "By email", count: s.byEmail }],
  };
}

async function readSwitches(admin: SupabaseClient): Promise<FunnelFacts["switches"]> {
  const [setting, aftercare, fee] = await Promise.all([
    admin.from("site_settings").select("value").eq("key", DRAFT_REMINDERS_ENABLED_KEY).maybeSingle(),
    readAftercareSettings(admin),
    readCheckupFee(admin),
  ]);
  if (setting.error) throw new Error(`site_settings: ${setting.error.message}`);
  return {
    draftReminders: parseDraftRemindersEnabled((setting.data as { value?: string } | null)?.value),
    reviewRequests: reviewRequestBlock(aftercare.reviewRequests) === null,
    checkups: checkupBlock(aftercare.checkups, fee.fee) === null,
    checkupMonths: aftercare.checkups.months,
    reviewRequestDays: aftercare.reviewRequests.daysAfter,
  };
}

const UNREAD_SWITCHES: FunnelFacts["switches"] = {
  draftReminders: false,
  reviewRequests: false,
  checkups: false,
  checkupMonths: DEFAULT_CHECKUP_SETTINGS.months,
  reviewRequestDays: DEFAULT_REVIEW_REQUEST_SETTINGS.daysAfter,
};

const settle = <T,>(part: string, p: Promise<T>) => orElse<T | null>(part, p, null);

export async function getEmailFunnel({ admin = supabaseAdmin(), now = new Date() }: { admin?: SupabaseClient; now?: Date } = {}): Promise<FunnelView> {
  const subscribedOf = (stage: LifecycleStage) =>
    countCustomers({ ...DEFAULT_CUSTOMER_FILTERS, stage: [stage], consent: "subscribed" }, now);

  const [summary, subscribed, segments, campaigns, stageResults, switches, drafts, review, checkup] = await Promise.all([
    getLifecycleSummary(),
    Promise.all(FUNNEL_STAGES.map((s) => orElse(`subscribed ${s}`, subscribedOf(s), null))),
    // ponytail: listSegments and listCampaigns read their tables in one request each, so past
    // 1,000 live Segments or campaigns the rest are missing. Far off (dozens today); the upgrade
    // is to page them to the end, as every other read here does.
    settle("segments", listSegments({ now })),
    settle("campaigns", listCampaigns(admin)),
    settle(
      "results",
      readAll<Record<string, unknown>>("email_campaign_stage_results", () =>
        admin.from("email_campaign_stage_results").select("*").order("campaign_id").order("cohort").order("stage"),
      ),
    ),
    settle("switches", readSwitches(admin)),
    settle("draft reminders", draftReminderCount(admin)),
    settle("review request", reviewRequestCount(admin)),
    settle("check-up reminder", checkupCount(admin)),
  ]);

  const notRead: FunnelPart[] = [];
  if (!summary) notRead.push("summary");
  if (!segments) notRead.push("segments");
  if (!campaigns) notRead.push("campaigns");
  if (!stageResults) notRead.push("results");
  if (!switches) notRead.push("switches");

  return buildFunnel({
    summary,
    subscribed: Object.fromEntries(FUNNEL_STAGES.map((s, i) => [s, subscribed[i]])),
    segments: (segments ?? []).map((s) => ({ id: s.id, name: s.name, count: s.count, needsReview: s.needsReview, params: s.params })),
    campaigns: (campaigns ?? []).map(({ campaign, stats }) => ({ campaign, stats })),
    stageResults: stageResults ?? [],
    automatic: {
      "lead.draft_reminders": drafts,
      "new.review_request": review,
      "aftercare.checkup_reminder": checkup,
    },
    switches: switches ?? UNREAD_SWITCHES,
    notRead,
  });
}
