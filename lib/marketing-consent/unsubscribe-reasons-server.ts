import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  UNSUBSCRIBE_REASONS,
  UNSUBSCRIBE_REASON_OUTCOMES,
  UNSUBSCRIBE_TEXT_MAX,
  isUnsubscribeReason,
  type UnsubscribeReason,
  type UnsubscribeReasonOutcome,
} from "./unsubscribe-reasons";

export const UnsubscribeAnswerSchema = z
  .object({
    reason: z.enum(UNSUBSCRIBE_REASONS),
    text: z
      .string()
      .trim()
      .max(UNSUBSCRIBE_TEXT_MAX, `At most ${UNSUBSCRIBE_TEXT_MAX} characters.`)
      .optional()
      .transform((v) => v || null),
  })
  .transform((a) => ({ reason: a.reason, text: a.reason === "other" ? a.text : null }));
export type UnsubscribeAnswer = z.output<typeof UnsubscribeAnswerSchema>;

export async function recordUnsubscribeReason(
  admin: SupabaseClient,
  customerId: string,
  answer: UnsubscribeAnswer,
): Promise<UnsubscribeReasonOutcome> {
  const { data, error } = await admin.rpc("record_unsubscribe_reason", {
    p_customer_id: customerId,
    p_reason: answer.reason,
    p_text: answer.text,
  });
  if (error) throw new Error(error.message);
  if (!(UNSUBSCRIBE_REASON_OUTCOMES as readonly string[]).includes(String(data))) {
    throw new Error(`Unexpected answer: ${String(data)}`);
  }
  return data as UnsubscribeReasonOutcome;
}

export interface CustomerUnsubscribeReason {
  reason: UnsubscribeReason;
  text: string | null;
  at: string;
}

const ASKED_SOURCES = ["unsubscribe_link", "account", "support"];

interface LatestUnsubscribe {
  eventId: number;
  source: string;
  reason: CustomerUnsubscribeReason | null;
}

async function readLatestUnsubscribe(admin: SupabaseClient, customerId: string): Promise<LatestUnsubscribe | null> {
  const { data, error } = await admin
    .from("customer_consent_events")
    .select("id, to_state, source")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const event = data as { id: number; to_state: string; source: string } | null;
  if (!event || event.to_state !== "unsubscribed") return null;
  const { data: answer, error: answerError } = await admin
    .from("customer_unsubscribe_reasons")
    .select("reason, other_text, created_at")
    .eq("consent_event_id", event.id)
    .maybeSingle();
  if (answerError) throw new Error(answerError.message);
  const row = answer as { reason: unknown; other_text: string | null; created_at: string } | null;
  return {
    eventId: event.id,
    source: event.source,
    reason: row && isUnsubscribeReason(row.reason) ? { reason: row.reason, text: row.other_text, at: row.created_at } : null,
  };
}

export async function readUnsubscribeQuestion(admin: SupabaseClient, customerId: string): Promise<"ask" | "answered" | null> {
  const latest = await readLatestUnsubscribe(admin, customerId);
  if (!latest || !ASKED_SOURCES.includes(latest.source)) return null;
  return latest.reason ? "answered" : "ask";
}

export async function readCustomerUnsubscribeReason(admin: SupabaseClient, customerId: string): Promise<CustomerUnsubscribeReason | null> {
  return (await readLatestUnsubscribe(admin, customerId))?.reason ?? null;
}

export async function readReasonsForEvents(
  admin: SupabaseClient,
  eventIds: readonly number[],
): Promise<Map<number, CustomerUnsubscribeReason>> {
  const out = new Map<number, CustomerUnsubscribeReason>();
  if (!eventIds.length) return out;
  const { data, error } = await admin
    .from("customer_unsubscribe_reasons")
    .select("consent_event_id, reason, other_text, created_at")
    .in("consent_event_id", [...eventIds]);
  if (error) throw new Error(error.message);
  for (const row of (data ?? []) as { consent_event_id: number; reason: unknown; other_text: string | null; created_at: string }[]) {
    if (isUnsubscribeReason(row.reason)) out.set(Number(row.consent_event_id), { reason: row.reason, text: row.other_text, at: row.created_at });
  }
  return out;
}

export const UNSUBSCRIBE_SUMMARY_DAYS = [30, 90, 365] as const;
export type UnsubscribeSummaryDays = (typeof UNSUBSCRIBE_SUMMARY_DAYS)[number];

const LATEST_TEXT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_ROWS = 1000;
export const UNSUBSCRIBE_SUMMARY_CAP = 20_000;

export interface UnsubscribeSummary {
  days: number;
  unsubscribes: { total: number; link: number; account: number; support: number; complaint: number; other: number };
  answers: number;
  byReason: { reason: UnsubscribeReason; count: number }[];
  latestText: { reason: UnsubscribeReason; text: string; at: string }[];
  capped?: number;
}

type EventRow = { source: string };
type AnswerRow = { reason: string; other_text: string | null; created_at: string };

export function summariseUnsubscribes(events: readonly EventRow[], answers: readonly AnswerRow[], days: number): UnsubscribeSummary {
  const unsubscribes = { total: events.length, link: 0, account: 0, support: 0, complaint: 0, other: 0 };
  for (const e of events) {
    if (e.source === "unsubscribe_link") unsubscribes.link++;
    else if (e.source === "account") unsubscribes.account++;
    else if (e.source === "support") unsubscribes.support++;
    else if (e.source === "complaint") unsubscribes.complaint++;
    else unsubscribes.other++;
  }
  const counts = new Map<UnsubscribeReason, number>(UNSUBSCRIBE_REASONS.map((r) => [r, 0]));
  const valid = answers.filter((a): a is AnswerRow & { reason: UnsubscribeReason } => isUnsubscribeReason(a.reason));
  for (const a of valid) counts.set(a.reason, (counts.get(a.reason) ?? 0) + 1);
  return {
    days,
    unsubscribes,
    answers: valid.length,
    byReason: [...counts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .filter((r) => r.count > 0)
      .sort((a, b) => b.count - a.count || UNSUBSCRIBE_REASONS.indexOf(a.reason) - UNSUBSCRIBE_REASONS.indexOf(b.reason)),
    latestText: valid
      .filter((a) => a.other_text)
      .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, LATEST_TEXT)
      .map((a) => ({ reason: a.reason, text: a.other_text!, at: a.created_at })),
  };
}

async function readWindow<T>(
  admin: SupabaseClient,
  table: string,
  columns: string,
  since: string,
  filter: (q: ReturnType<ReturnType<SupabaseClient["from"]>["select"]>) => ReturnType<ReturnType<SupabaseClient["from"]>["select"]>,
  cap: number,
): Promise<{ rows: T[]; capped: boolean }> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await filter(admin.from(table).select(columns))
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as T[];
    rows.push(...page);
    if (page.length < PAGE_ROWS) return { rows, capped: false };
    if (rows.length >= cap) {
      rows.length = cap;
      return { rows, capped: true };
    }
  }
}

export async function readUnsubscribeSummary(
  admin: SupabaseClient,
  { days, now = new Date(), cap = UNSUBSCRIBE_SUMMARY_CAP }: { days: number; now?: Date; cap?: number },
): Promise<UnsubscribeSummary> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const [events, answers] = await Promise.all([
    readWindow<EventRow>(admin, "customer_consent_events", "source", since, (q) => q.eq("to_state", "unsubscribed"), cap),
    readWindow<AnswerRow>(admin, "customer_unsubscribe_reasons", "reason, other_text, created_at", since, (q) => q, cap),
  ]);
  const summary = summariseUnsubscribes(events.rows, answers.rows, days);
  return events.capped || answers.capped ? { ...summary, capped: cap } : summary;
}
