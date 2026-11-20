import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DROP_OFF_REASONS,
  DROP_OFF_STEPS,
  type DropOffReason,
  type DropOffStep,
} from "@/lib/analytics/drop-off/reasons";

export interface DropOffInsert {
  step: DropOffStep;
  reason: DropOffReason;
  other_text: string | null;
  path: string | null;
  visit_id: string | null;
  visitor_id: string | null;
  result_id: string | null;
}

const isUniqueViolation = (error: { code?: string; message?: string }) =>
  error.code === "23505" || /duplicate key|unique/i.test(error.message ?? "");

export async function recordDropOffReason(
  admin: SupabaseClient,
  row: DropOffInsert,
): Promise<"recorded" | "duplicate"> {
  const { error } = await admin.from("drop_off_reasons").insert(row);
  if (!error) return "recorded";
  if (isUniqueViolation(error)) return "duplicate";
  throw new Error(error.message);
}

export interface DropOffRow {
  step: DropOffStep;
  reason: DropOffReason;
  other_text: string | null;
  created_at: string;
}

export interface DropOffSummary {
  days: number;
  total: number;
  byReason: { reason: DropOffReason; count: number; byStep: Record<DropOffStep, number> }[];
  byStep: Record<DropOffStep, number>;
  weeks: { weekStart: string; count: number; partial: boolean }[];
  latestText: { step: DropOffStep; reason: DropOffReason; text: string; at: string }[];
  capped?: number;
}

export const SUMMARY_DAYS = [30, 90, 365] as const;
export type SummaryDays = (typeof SUMMARY_DAYS)[number];
const LATEST_TEXT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const SGT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function weekStartOf(ms: number): string {
  const d = new Date(ms + SGT_OFFSET_MS);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday)).toISOString().slice(0, 10);
}

const weekStartMs = (weekStart: string) => Date.parse(`${weekStart}T00:00:00Z`) - SGT_OFFSET_MS;

export function summariseDropOffs(rows: readonly DropOffRow[], { days, now }: { days: number; now: Date }): DropOffSummary {
  const since = now.getTime() - days * DAY_MS;
  const inWindow = rows.filter((r) => {
    const at = Date.parse(r.created_at);
    return !Number.isNaN(at) && at >= since && at <= now.getTime();
  });

  const zeroSteps = () => Object.fromEntries(DROP_OFF_STEPS.map((s) => [s, 0])) as Record<DropOffStep, number>;
  const byStep = zeroSteps();
  const reasons = new Map<DropOffReason, Record<DropOffStep, number>>(DROP_OFF_REASONS.map((r) => [r, zeroSteps()]));
  const weeks = new Map<string, number>();
  for (let t = since; t <= now.getTime(); t += 7 * DAY_MS) weeks.set(weekStartOf(t), 0);
  weeks.set(weekStartOf(now.getTime()), weeks.get(weekStartOf(now.getTime())) ?? 0);

  for (const r of inWindow) {
    byStep[r.step] += 1;
    reasons.get(r.reason)![r.step] += 1;
    const week = weekStartOf(Date.parse(r.created_at));
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }

  const byReason = [...reasons.entries()]
    .map(([reason, steps]) => ({
      reason,
      count: Object.values(steps).reduce((a, b) => a + b, 0),
      byStep: steps,
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || DROP_OFF_REASONS.indexOf(a.reason) - DROP_OFF_REASONS.indexOf(b.reason));

  const latestText = inWindow
    .filter((r) => r.other_text)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, LATEST_TEXT)
    .map((r) => ({ step: r.step, reason: r.reason, text: r.other_text!, at: r.created_at }));

  return {
    days,
    total: inWindow.length,
    byReason,
    byStep,
    weeks: [...weeks.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, count]) => {
        const start = weekStartMs(weekStart);
        return { weekStart, count, partial: start < since || start + WEEK_MS > now.getTime() };
      }),
    latestText,
  };
}

const PAGE_ROWS = 1000;
export const SUMMARY_ROW_CAP = 50_000;

export async function readDropOffSummary(
  admin: SupabaseClient,
  { days, now = new Date(), cap = SUMMARY_ROW_CAP }: { days: number; now?: Date; cap?: number },
): Promise<DropOffSummary> {
  const since = new Date(now.getTime() - days * DAY_MS).toISOString();
  const rows: DropOffRow[] = [];
  let capped = false;
  for (;;) {
    const { data, error } = await admin
      .from("drop_off_reasons")
      .select("step, reason, other_text, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(rows.length, rows.length + PAGE_ROWS - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as DropOffRow[];
    rows.push(...page);
    if (page.length < PAGE_ROWS) break;
    if (rows.length >= cap) {
      capped = true;
      rows.length = cap;
      break;
    }
  }
  const summary = summariseDropOffs(rows, { days, now });
  return capped ? { ...summary, capped: cap } : summary;
}
