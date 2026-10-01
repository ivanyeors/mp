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
import { buildChannelMix, singaporeDate, type MixVisit } from "@/lib/analytics/channel-mix";
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

const PAGE = 1000;

/** PostgREST caps a response at 1000 rows; page through with `.range()`. */
async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

/** Visits by channel (AI assistants separate) + per-channel funnel (slice 03). First-party data only. */
export async function getChannelMix(input: { range: string; granularity: string }) {
  await assertAdmin("analytics");

  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const granularity: Granularity = input.granularity === "day" ? "day" : "week";
  const to = singaporeDate(new Date().toISOString());
  const from = addDays(to, -(days - 1));
  // Singapore midnight of the chart's first day, as an instant.
  const sinceIso = new Date(Date.parse(`${bucketStart(from, granularity)}T00:00:00+08:00`)).toISOString();
  const admin = supabaseAdmin();

  const visits = await fetchAllPages<MixVisit>((a, b) =>
    admin
      .from("analytics_visits")
      .select("id, started_at, entry_source, entry_medium, referrer_host, converted_order_id")
      .gte("started_at", sinceIso)
      .order("started_at", { ascending: true })
      .range(a, b),
  );

  const configEvents = await fetchAllPages<{ visit_id: string }>((a, b) =>
    admin
      .from("analytics_events")
      .select("visit_id")
      .eq("type", "page_view")
      .gte("occurred_at", sinceIso)
      .or("path.ilike.%/mp-config%,path.ilike.%/mbolster-config%")
      .order("occurred_at", { ascending: true })
      .range(a, b),
  );

  const orderIds = [...new Set(visits.map((v) => v.converted_order_id).filter((id): id is string => !!id))];
  const orderTotals = new Map<string, number>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data, error } = await admin.from("orders").select("id, total").in("id", orderIds.slice(i, i + 200));
    if (error) throw new Error(`Channel mix orders: ${error.message}`);
    for (const o of data ?? []) orderTotals.set(o.id as string, Number(o.total));
  }

  return {
    from,
    to,
    granularity,
    ...buildChannelMix({
      visits,
      configuratorVisitIds: new Set(configEvents.map((e) => e.visit_id)),
      orderTotals,
      from,
      to,
      granularity,
    }),
  };
}
