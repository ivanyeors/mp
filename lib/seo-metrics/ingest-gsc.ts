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

/**
 * Daily Search Console snapshot into `seo_daily_metrics` (slice 01,
 * PRD-search-visibility). The admin page reads only this table, never Google,
 * and the table keeps history past GSC's 16-month window.
 */

export const GSC_SOURCE = "gsc_web";

/** GSC reports lag ~2–3 days and keep changing; re-fetch this many days every run. */
export const REFETCH_DAYS = 3;
/** First run without a backfill: fetch this much, then `npm run seo:gsc-backfill` for the rest. */
export const INITIAL_DAYS = 30;
/** GSC keeps 16 months; asking for older dates returns nothing. */
export const MAX_HISTORY_DAYS = 486;

export type SeoDimension = "total" | "query" | "page" | "query_page" | "country" | "device";

const DIMENSIONS: Record<SeoDimension, GscDimension[]> = {
  total: ["date"],
  query: ["date", "query"],
  page: ["date", "page"],
  // Which page ranks for which query: target-query ranking URL and cannibalisation (slices 06, 09).
  query_page: ["date", "query", "page"],
  country: ["date", "country"],
  device: ["date", "device"],
};

export type SeoMetricRow = {
  date: string;
  source: string;
  dimension: SeoDimension;
  /** Empty string for `total`, so the unique key never contains NULL. */
  key: string;
  clicks: number;
  impressions: number;
  /**
   * avg position × impressions. Stored instead of the average so any rollup can
   * recompute an impression-weighted position exactly: Σposition_sum / Σimpressions.
   */
  position_sum: number;
};

export type SeoMetricsStore = {
  latestDate(source: string): Promise<string | null>;
  upsert(rows: SeoMetricRow[]): Promise<void>;
};

export { addDays };
export { queryPageKey, splitQueryPageKey, QUERY_PAGE_SEPARATOR } from "@/lib/seo-metrics/keys";

/**
 * Start from a few days before the newest stored date so settling days are
 * overwritten. With nothing stored, take a bounded first slice.
 */
export function planWindow(latest: string | null, today: string): { startDate: string; endDate: string } {
  const earliest = addDays(today, -MAX_HISTORY_DAYS);
  const start = latest ? addDays(latest, -REFETCH_DAYS) : addDays(today, -INITIAL_DAYS);
  return { startDate: start < earliest ? earliest : start, endDate: today };
}

export function toMetricRows(dimension: SeoDimension, rows: GscRow[]): SeoMetricRow[] {
  return rows.map((r) => ({
    date: r.keys[0],
    source: GSC_SOURCE,
    dimension,
    key: dimension === "total" ? "" : dimension === "query_page" ? queryPageKey(r.keys[1] ?? "", r.keys[2] ?? "") : (r.keys[1] ?? ""),
    clicks: r.clicks,
    impressions: r.impressions,
    position_sum: r.position * r.impressions,
  }));
}

export type GscIngestSummary = {
  ok: true;
  startDate: string;
  endDate: string;
  rows: Record<SeoDimension, number>;
};

export async function runGscIngest(
  store: SeoMetricsStore,
  client: GscClient,
  opts: { today: string; startDate?: string; endDate?: string },
): Promise<GscIngestSummary> {
  const planned = planWindow(await store.latestDate(GSC_SOURCE), opts.today);
  const startDate = opts.startDate ?? planned.startDate;
  const endDate = opts.endDate ?? planned.endDate;

  const rows = {} as Record<SeoDimension, number>;
  for (const dimension of Object.keys(DIMENSIONS) as SeoDimension[]) {
    const fetched = await client.queryAll({ startDate, endDate, dimensions: DIMENSIONS[dimension] });
    const mapped = toMetricRows(dimension, fetched);
    await store.upsert(mapped);
    rows[dimension] = mapped.length;
  }
  return { ok: true, startDate, endDate, rows };
}

const UPSERT_BATCH = 1000;

export function createSupabaseSeoMetricsStore(admin: SupabaseClient): SeoMetricsStore {
  return {
    async latestDate(source) {
      const { data, error } = await admin
        .from("seo_daily_metrics")
        .select("date")
        .eq("source", source)
        .eq("dimension", "total")
        .order("date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`seo_daily_metrics latest: ${error.message}`);
      return (data?.date as string | undefined) ?? null;
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

/** Cron entry point: a logged no-op when GSC is not configured. */
export async function runGscIngestFromEnv(
  admin: SupabaseClient,
  opts: { today?: string; startDate?: string; endDate?: string } = {},
): Promise<GscIngestSummary | { ok: true; skipped: string }> {
  const config = getGscConfig();
  if (!config) return { ok: true, skipped: "Search Console env not set" };
  return runGscIngest(createSupabaseSeoMetricsStore(admin), createGscClient(config), {
    today: opts.today ?? new Date().toISOString().slice(0, 10),
    startDate: opts.startDate,
    endDate: opts.endDate,
  });
}
