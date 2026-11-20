"use server";

import { assertAdmin } from "@/lib/auth/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  bucketStart,
  bucketize,
  compareTotals,
  previousPeriod,
  sumBuckets,
  summarize,
  type DailyTotal,
  type Granularity,
} from "@/lib/seo-metrics/aggregate";
import { addDays } from "@/lib/seo-metrics/dates";
import { buildChannelMix, singaporeDate, type MixVisit } from "@/lib/analytics/channel-mix";
import type { VisitSourceFields } from "@/lib/analytics/ai-referrers";
import { loadFirstVisits } from "@/lib/analytics/journey/first-touch";
import { buildCrawlerActivity, type CrawlerHitRow } from "@/lib/analytics/crawler-activity";
import { validateAnnotation, type Annotation, type AnnotationInput } from "@/lib/seo-metrics/annotations";
import { splitQueryPageKey } from "@/lib/seo-metrics/keys";
import {
  buildMovers,
  buildWatchlist,
  normalizeQuery,
  SPARK_WEEKS,
  type KeyDaily,
  type KeyTotals,
} from "@/lib/seo-metrics/queries";
import { createSupabaseSeoMetricsStore, GSC_SOURCE } from "@/lib/seo-metrics/ingest-gsc";
import { parseReport, REPORT_LABELS, siteMismatchWarning } from "@/lib/seo-metrics/csv-import";
import { getSiteOrigin } from "@/lib/site-url";

// ponytail: do not `export type { X }` from "use server" — see actions.ts

const RANGE_DAYS = { "28d": 28, "3m": 91, "6m": 182, "12m": 364, "16m": 486 } as const;

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
    buckets: bucketize(
      rows.filter((r) => r.date >= bucketStart(from, granularity)),
      { from: bucketStart(from, granularity), to, granularity, today },
    ),
  };
}

const PAGE = 1000;

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

export async function getChannelMix(input: { range: string; granularity: string }) {
  await assertAdmin("analytics");

  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const granularity: Granularity = input.granularity === "day" ? "day" : "week";
  const to = singaporeDate(new Date().toISOString());
  const from = addDays(to, -(days - 1));
  const sinceIso = new Date(Date.parse(`${bucketStart(from, granularity)}T00:00:00+08:00`)).toISOString();
  const admin = supabaseAdmin();

  const visits = await fetchAllPages<MixVisit & { visitor_id: string }>((a, b) =>
    admin
      .from("analytics_visits")
      .select(
        "id, visitor_id, started_at, entry_source, entry_medium, referrer_host, entry_click_id_kind, entry_app, converted_order_id",
      )
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

  const payers = visits.filter((v) => v.converted_order_id && orderTotals.has(v.converted_order_id));
  const firstTouch = new Map<string, VisitSourceFields>();
  try {
    const firstByVisitor = await loadFirstVisits(admin, payers.map((v) => v.visitor_id));
    for (const v of payers) {
      const first = firstByVisitor.get(v.visitor_id);
      if (first) firstTouch.set(v.id, first);
    }
  } catch (e) {
    console.error("[analytics] First touch could not be read:", e);
  }

  return {
    from,
    to,
    granularity,
    ...buildChannelMix({
      visits,
      firstTouch,
      configuratorVisitIds: new Set(configEvents.map((e) => e.visit_id)),
      orderTotals,
      from,
      to,
      granularity,
    }),
  };
}

export async function getCrawlerActivity(input: { range: string; granularity: string }) {
  await assertAdmin("analytics");

  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const granularity: Granularity = input.granularity === "day" ? "day" : "week";
  const to = singaporeDate(new Date().toISOString());
  const from = addDays(to, -(days - 1));
  const prev = previousPeriod(from, to);
  const since = prev.from < bucketStart(from, granularity) ? prev.from : bucketStart(from, granularity);

  const admin = supabaseAdmin();
  const rows = await fetchAllPages<CrawlerHitRow>((a, b) =>
    admin
      .from("ai_crawler_hits")
      .select("date, bot, path_group, hits")
      .gte("date", since)
      .lte("date", to)
      .order("date", { ascending: true })
      .range(a, b),
  );

  return {
    from,
    to,
    granularity,
    hasData: rows.length > 0,
    ...buildCrawlerActivity({ rows, from, to, previousFrom: prev.from, granularity }),
  };
}

export async function getSeoAnnotations(input: { range: string; granularity: string }): Promise<Annotation[]> {
  await assertAdmin("analytics");
  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const granularity: Granularity = input.granularity === "day" ? "day" : "week";
  const to = singaporeDate(new Date().toISOString());
  const from = bucketStart(addDays(to, -(days - 1)), granularity);
  const { data, error } = await supabaseAdmin()
    .from("seo_annotations")
    .select("id, date, label, category, url")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true });
  if (error) throw new Error(`Annotations: ${error.message}`);
  return (data ?? []) as Annotation[];
}

export async function createSeoAnnotation(input: AnnotationInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await assertAdmin("analytics");
  const parsed = validateAnnotation(input);
  if (!parsed.ok) return parsed;
  const { error } = await supabaseAdmin()
    .from("seo_annotations")
    .insert({ ...parsed.value, created_by: ctx.email });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteSeoAnnotation(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin("analytics");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: "Unknown annotation." };
  const { error } = await supabaseAdmin().from("seo_annotations").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

async function rollup(source: string, dimension: string, from: string, to: string): Promise<KeyTotals[]> {
  const admin = supabaseAdmin();
  const rows = await fetchAllPages<{ key: string; clicks: number; impressions: number; position_sum: number }>((a, b) =>
    admin.rpc("seo_metric_rollup", { p_source: source, p_dimension: dimension, p_from: from, p_to: to }).range(a, b),
  );
  return rows.map((r) => ({ ...r, clicks: Number(r.clicks), impressions: Number(r.impressions), position_sum: Number(r.position_sum) }));
}

export async function getSearchQueries(input: { range: string }) {
  await assertAdmin("analytics");
  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const today = new Date().toISOString().slice(0, 10);
  const from = addDays(today, -(days - 1));
  const prev = previousPeriod(from, today);
  const admin = supabaseAdmin();

  const { data: targetRows, error } = await admin
    .from("seo_target_queries")
    .select("query")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Target queries: ${error.message}`);
  const targets = (targetRows ?? []).map((r) => r.query as string);

  const [queries, previousQueries, pages, previousPages, queryPages] = await Promise.all([
    rollup(GSC_SOURCE, "query", from, today),
    rollup(GSC_SOURCE, "query", prev.from, prev.to),
    rollup(GSC_SOURCE, "page", from, today),
    rollup(GSC_SOURCE, "page", prev.from, prev.to),
    rollup(GSC_SOURCE, "query_page", from, today),
  ]);

  const sparkFrom = addDays(today, -(SPARK_WEEKS * 7 + 6));
  const daily = targets.length
    ? await fetchAllPages<KeyDaily>((a, b) =>
        admin
          .from("seo_daily_metrics")
          .select("date, key, clicks, impressions, position_sum")
          .eq("source", GSC_SOURCE)
          .eq("dimension", "query")
          .in("key", targets)
          .gte("date", sparkFrom)
          .order("date", { ascending: true })
          .range(a, b),
      )
    : [];

  const targetSet = new Set(targets);
  return {
    hasData: queries.length > 0 || previousQueries.length > 0,
    watchlist: buildWatchlist({
      targets,
      current: queries.filter((q) => targetSet.has(q.key)),
      previous: previousQueries.filter((q) => targetSet.has(q.key)),
      daily,
      queryPages: queryPages.filter((qp) => targetSet.has(splitQueryPageKey(qp.key).query)),
      today,
    }),
    queryMovers: buildMovers(queries, previousQueries),
    pageMovers: buildMovers(pages, previousPages),
  };
}

export async function addTargetQuery(raw: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await assertAdmin("analytics");
  const query = normalizeQuery(raw ?? "");
  if (query.length < 2 || query.length > 120) return { ok: false, error: "Use 2–120 characters." };
  const { error } = await supabaseAdmin()
    .from("seo_target_queries")
    .upsert({ query, created_by: ctx.email }, { onConflict: "query", ignoreDuplicates: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function removeTargetQuery(query: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertAdmin("analytics");
  const { error } = await supabaseAdmin().from("seo_target_queries").delete().eq("query", normalizeQuery(query));
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

const MAX_IMPORT_FILES = 12;
const MAX_IMPORT_BYTES = 2_000_000;

export async function importAiReports(files: { name: string; text: string }[]) {
  await assertAdmin("analytics");
  if (!Array.isArray(files) || !files.length) return { ok: false as const, error: "Choose at least one CSV file." };
  if (files.length > MAX_IMPORT_FILES) return { ok: false as const, error: `Upload at most ${MAX_IMPORT_FILES} files at once.` };

  const importDate = singaporeDate(new Date().toISOString());
  let period: string | undefined;
  for (const f of files) {
    const p = parseReport(f.text ?? "", { importDate });
    if (p.ok && p.kind === "gsc_genai_filters") period = p.period;
  }

  const store = createSupabaseSeoMetricsStore(supabaseAdmin());
  const results: { name: string; ok: boolean; label?: string; rows?: number; skipped?: number; error?: string; warning?: string }[] = [];
  const host = new URL(getSiteOrigin()).host;
  for (const f of files) {
    const name = String(f.name ?? "file").slice(0, 120);
    if ((f.text?.length ?? 0) > MAX_IMPORT_BYTES) {
      results.push({ name, ok: false, error: "File is larger than 2 MB." });
      continue;
    }
    const parsed = parseReport(f.text ?? "", { importDate, period });
    if (!parsed.ok) {
      results.push({ name, ok: false, error: parsed.error });
      continue;
    }
    try {
      if (parsed.rows.length) await store.upsert(parsed.rows);
      results.push({
        name,
        ok: true,
        label: REPORT_LABELS[parsed.kind],
        rows: parsed.rows.length,
        skipped: parsed.skipped,
        warning: siteMismatchWarning(name, host) ?? undefined,
      });
    } catch (e) {
      results.push({ name, ok: false, error: e instanceof Error ? e.message : "Save failed" });
    }
  }
  return { ok: true as const, results };
}

async function latestImport(source: string, dimension: string) {
  const { data } = await supabaseAdmin()
    .from("seo_daily_metrics")
    .select("date, synced_at, extra")
    .eq("source", source)
    .eq("dimension", dimension)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { date: string; synced_at: string; extra: Record<string, unknown> | null } | null;
}

export async function getAiAnswers(input: { range: string; granularity: string }) {
  await assertAdmin("analytics");
  const days = RANGE_DAYS[input.range as keyof typeof RANGE_DAYS] ?? RANGE_DAYS["3m"];
  const granularity: Granularity = input.granularity === "day" ? "day" : "week";
  const to = singaporeDate(new Date().toISOString());
  const from = addDays(to, -(days - 1));
  const chartFrom = bucketStart(from, granularity);
  const admin = supabaseAdmin();

  const earliest = async (source: string) => {
    const { data } = await admin
      .from("seo_daily_metrics")
      .select("date")
      .eq("source", source)
      .eq("dimension", "total")
      .order("date", { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data?.date as string | undefined) ?? null;
  };

  const series = async (source: "gsc_genai" | "bing_ai") => {
    const [rows, latest, firstDate] = await Promise.all([
      fetchAllPages<{ date: string; impressions: number; extra: { cited_pages?: number } | null }>((a, b) =>
        admin
          .from("seo_daily_metrics")
          .select("date, impressions, extra")
          .eq("source", source)
          .eq("dimension", "total")
          .gte("date", chartFrom)
          .lte("date", to)
          .order("date", { ascending: true })
          .range(a, b),
      ),
      latestImport(source, "total"),
      earliest(source),
    ]);
    const inRange = rows.filter((r) => r.date >= from);
    return {
      lastDate: latest?.date ?? null,
      importedAt: latest?.synced_at ?? null,
      total: inRange.reduce((s, r) => s + r.impressions, 0),
      citedPagesPeak: Math.max(0, ...inRange.map((r) => Number(r.extra?.cited_pages ?? 0))),
      points: sumBuckets(
        rows.map((r) => ({ date: r.date, value: r.impressions })),
        { from: chartFrom, to, granularity, firstDate, lastDate: latest?.date ?? null },
      ),
    };
  };

  const [google, bing, pagesLatest] = await Promise.all([
    series("gsc_genai"),
    series("bing_ai"),
    latestImport("gsc_genai", "page_period"),
  ]);

  let topPages: { page: string; impressions: number }[] = [];
  if (pagesLatest) {
    const { data } = await admin
      .from("seo_daily_metrics")
      .select("key, impressions")
      .eq("source", "gsc_genai")
      .eq("dimension", "page_period")
      .eq("date", pagesLatest.date)
      .order("impressions", { ascending: false })
      .limit(10);
    topPages = (data ?? []).map((r) => ({ page: r.key as string, impressions: Number(r.impressions) }));
  }

  return {
    granularity,
    google,
    bing,
    topPages: pagesLatest
      ? { importedOn: pagesLatest.date, period: String(pagesLatest.extra?.period ?? ""), rows: topPages }
      : null,
  };
}
