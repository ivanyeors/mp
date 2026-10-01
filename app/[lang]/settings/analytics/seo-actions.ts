"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  bucketStart,
  bucketize,
  compareTotals,
  previousPeriod,
  summarize,
  type DailyTotal,
  type Granularity,
} from "@/lib/seo-metrics/aggregate";
import { addDays } from "@/lib/seo-metrics/dates";
import { GSC_SOURCE } from "@/lib/seo-metrics/ingest-gsc";

// ponytail: do not `export type { X }` from "use server" — see actions.ts

const RANGE_DAYS = { "28d": 28, "3m": 91, "6m": 182, "12m": 364, "16m": 486 } as const;

/** Search Console totals for the visibility section (slice 02). Reads Supabase only, never Google. */
export async function getSearchVisibility(input: {
  range: string;
  granularity: string;
}) {
  await assertAdmin("analytics");

  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const granularity: Granularity = input.granularity === "day" ? "day" : "week";
  const today = new Date().toISOString().slice(0, 10);
  const to = today;
  const from = addDays(today, -(days - 1));
  const prev = previousPeriod(from, to);

  const { data, error } = await supabaseAdmin()
    .from("seo_daily_metrics")
    .select("date, clicks, impressions, position_sum")
    .eq("source", GSC_SOURCE)
    .eq("dimension", "total")
    .gte("date", prev.from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw new Error(`Search visibility: ${error.message}`);

  const rows = (data ?? []) as DailyTotal[];
  const current = rows.filter((r) => r.date >= from);
  const previous = rows.filter((r) => r.date < from);
  const totals = summarize(current);
  const previousTotals = summarize(previous);

  return {
    from,
    to,
    granularity,
    hasData: rows.length > 0,
    lastDate: rows.length ? rows[rows.length - 1].date : null,
    totals,
    previousTotals,
    deltas: compareTotals(totals, previousTotals),
    // Weekly buckets start on the Monday on/before `from`, so the first point is a
    // whole week rather than a misleading 2-day dip. KPI totals stay on [from, to].
    buckets: bucketize(
      rows.filter((r) => r.date >= bucketStart(from, granularity)),
      { from: bucketStart(from, granularity), to, granularity, today },
    ),
  };
}
