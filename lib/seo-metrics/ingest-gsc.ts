import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGscClient,
  getGscConfig,
  type GscClient,
  type GscDimension,
  type GscRow,
} from "@/lib/google/search-console";
import { addDays } from "@/lib/seo-metrics/dates";
import { queryPageKey } from "@/lib/seo-metrics/keys";

export const GSC_SOURCE = "gsc_web";

export const REFETCH_DAYS = 3;
export const INITIAL_DAYS = 30;
export const MAX_HISTORY_DAYS = 486;
export const BACKFILL_WINDOW_DAYS = 30;
export const BACKFILL_WINDOWS_PER_RUN = 4;
// ponytail: a site whose 30 days take longer than the cron's time limit would need its own cron; a
// few months of mpillow.com take seconds.
export const BACKFILL_BUDGET_MS = 90_000;

export type SeoDimension = "total" | "query" | "page" | "query_page" | "country" | "device";

const DIMENSIONS: Record<SeoDimension, GscDimension[]> = {
  query: ["date", "query"],
  page: ["date", "page"],
  query_page: ["date", "query", "page"],
  country: ["date", "country"],
  device: ["date", "device"],
  total: ["date"],
};

export type PeriodDimension = "page_period" | "country_period" | "device_period";

export type SeoMetricRow = {
  date: string;
  source: string;
  dimension: SeoDimension | PeriodDimension;
  key: string;
  clicks: number;
  impressions: number;
  position_sum: number;
  extra?: Record<string, unknown>;
};

export type SeoMetricsStore = {
  latestDate(source: string, property: string): Promise<string | null>;
  storedDays(source: string, property: string, from: string): Promise<string[]>;
  upsert(rows: SeoMetricRow[]): Promise<void>;
};

export { addDays };
export { queryPageKey, splitQueryPageKey, QUERY_PAGE_SEPARATOR } from "@/lib/seo-metrics/keys";

export function planWindow(latest: string | null, today: string): { startDate: string; endDate: string } {
  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const start = latest ? addDays(latest, -REFETCH_DAYS) : addDays(today, -INITIAL_DAYS);
  return { startDate: start < earliest ? earliest : start, endDate: today };
}

export function toMetricRows(dimension: SeoDimension, rows: GscRow[], property: string): SeoMetricRow[] {
  return rows.map((r) => ({
    date: r.keys[0],
    source: GSC_SOURCE,
    dimension,
    key: dimension === "total" ? "" : dimension === "query_page" ? queryPageKey(r.keys[1] ?? "", r.keys[2] ?? "") : (r.keys[1] ?? ""),
    clicks: r.clicks,
    impressions: r.impressions,
    position_sum: r.position * r.impressions,
    ...(dimension === "total" ? { extra: { property } } : {}),
  }));
}

type DateWindow = { startDate: string; endDate: string };

export function backfillWindows(gscDays: string[], stored: Set<string>, max: number): DateWindow[] {
  const missing = gscDays.filter((d) => !stored.has(d)).sort().reverse();
  const windows: DateWindow[] = [];
  let i = 0;
  while (i < missing.length && windows.length < max) {
    const endDate = missing[i];
    const floor = addDays(endDate, -(BACKFILL_WINDOW_DAYS - 1));
    while (i < missing.length && missing[i] >= floor) i++;
    windows.push({ startDate: missing[i - 1], endDate });
  }
  return windows;
}

export type GscIngestSummary = {
  ok: true;
  property: string;
  startDate: string;
  endDate: string;
  rows: Record<SeoDimension, number>;
  backfilled: DateWindow[];
  missingDays: number;
};

async function ingestWindow(
  store: SeoMetricsStore,
  client: GscClient,
  property: string,
  window: DateWindow,
): Promise<Record<SeoDimension, number>> {
  const rows = {} as Record<SeoDimension, number>;
  for (const dimension of Object.keys(DIMENSIONS) as SeoDimension[]) {
    const fetched = await client.queryAll({ ...window, dimensions: DIMENSIONS[dimension] });
    const mapped = toMetricRows(dimension, fetched, property);
    await store.upsert(mapped);
    rows[dimension] = mapped.length;
  }
  return rows;
}

export async function runGscIngest(
  store: SeoMetricsStore,
  client: GscClient,
  opts: {
    today: string;
    property: string;
    maxBackfillWindows?: number;
    deadline?: number;
  },
): Promise<GscIngestSummary> {
  const { today, property } = opts;
  const deadline = opts.deadline ?? Date.now() + BACKFILL_BUDGET_MS;

  const recent = planWindow(await store.latestDate(GSC_SOURCE, property), today);
  const rows = await ingestWindow(store, client, property, recent);

  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const gscDays = (await client.queryAll({ startDate: earliest, endDate: today, dimensions: ["date"] })).map(
    (r) => r.keys[0],
  );
  const stored = new Set(await store.storedDays(GSC_SOURCE, property, earliest));
  const backfilled: DateWindow[] = [];
  for (const window of backfillWindows(gscDays, stored, opts.maxBackfillWindows ?? BACKFILL_WINDOWS_PER_RUN)) {
    if (Date.now() > deadline) break;
    await ingestWindow(store, client, property, window);
    backfilled.push(window);
  }
  const missingDays = gscDays.filter(
    (d) => !stored.has(d) && !backfilled.some((w) => d >= w.startDate && d <= w.endDate),
  ).length;

  return { ok: true, property, ...recent, rows, backfilled, missingDays };
}

const UPSERT_BATCH = 1000;

export function createSupabaseSeoMetricsStore(admin: SupabaseClient): SeoMetricsStore {
  return {
    async latestDate(source, property) {
      const { data, error } = await admin
        .from("seo_daily_metrics")
        .select("date")
        .eq("source", source)
        .eq("dimension", "total")
        .eq("extra->>property", property)
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`seo_daily_metrics latest: ${error.message}`);
      return (data?.date as string | undefined) ?? null;
    },
    async storedDays(source, property, from) {
      const { data, error } = await admin
        .from("seo_daily_metrics")
        .select("date")
        .eq("source", source)
        .eq("dimension", "total")
        .eq("extra->>property", property)
        .gte("date", from);
      if (error) throw new Error(`seo_daily_metrics stored days: ${error.message}`);
      return (data ?? []).map((r) => r.date as string);
    },
    async upsert(rows) {
      for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
        const synced_at = new Date().toISOString();
        const { error } = await admin
          .from("seo_daily_metrics")
          .upsert(
            rows.slice(i, i + UPSERT_BATCH).map((r) => ({ ...r, synced_at })),
            { onConflict: "date,source,dimension,key" },
          );
        if (error) throw new Error(`seo_daily_metrics upsert: ${error.message}`);
      }
    },
  };
}

export async function runGscIngestFromEnv(
  admin: SupabaseClient,
): Promise<GscIngestSummary | { ok: true; skipped: string }> {
  const config = getGscConfig();
  if (!config) return { ok: true, skipped: "Search Console env not set" };
  return runGscIngest(createSupabaseSeoMetricsStore(admin), createGscClient(config), {
    today: new Date().toISOString().slice(0, 10),
    property: config.siteUrl,
  });
}
