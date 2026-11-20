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
 *
 * It also loads history on its own: each run fills in the days Search Console
 * has that are not stored yet for the property in GOOGLE_SEARCH_CONSOLE_SITE_URL,
 * a few months at a time, newest first. So pointing the env at another property
 * (sc-domain:mpillow.com, 2026-11-20) brings its 16 months in over a few daily
 * runs, with no export and no script.
 */

export const GSC_SOURCE = "gsc_web";

/** GSC reports lag ~2–3 days and keep changing; re-fetch this many days every run. */
export const REFETCH_DAYS = 3;
/** First run without a backfill: fetch this much, then `npm run seo:gsc-backfill` for the rest. */
export const INITIAL_DAYS = 30;
/** GSC keeps 16 months; asking for older dates returns nothing. */
export const MAX_HISTORY_DAYS = 486;
/** History is loaded in windows of this many days, newest first. */
export const BACKFILL_WINDOW_DAYS = 30;
/** Windows per run: 16 months arrive over about four daily runs. */
export const BACKFILL_WINDOWS_PER_RUN = 4;
/**
 * No new window starts after this long, so the rest of the results-sla chain
 * still runs. ponytail: a site whose 30 days take longer than the cron's time
 * limit would need its own cron; a few months of mpillow.com take seconds.
 */
export const BACKFILL_BUDGET_MS = 90_000;

export type SeoDimension = "total" | "query" | "page" | "query_page" | "country" | "device";

// `total` last: its row is what marks a day as fully stored (see storedDays).
const DIMENSIONS: Record<SeoDimension, GscDimension[]> = {
  query: ["date", "query"],
  page: ["date", "page"],
  // Which page ranks for which query: target-query ranking URL and cannibalisation (slices 06, 09).
  query_page: ["date", "query", "page"],
  country: ["date", "country"],
  device: ["date", "device"],
  total: ["date"],
};

/** Whole-period snapshots from manual imports (csv-import.ts); never in daily rollups. */
export type PeriodDimension = "page_period" | "country_period" | "device_period";

export type SeoMetricRow = {
  date: string;
  source: string;
  dimension: SeoDimension | PeriodDimension;
  /** Empty string for `total`, so the unique key never contains NULL. */
  key: string;
  clicks: number;
  impressions: number;
  /**
   * avg position × impressions. Stored instead of the average so any rollup can
   * recompute an impression-weighted position exactly: Σposition_sum / Σimpressions.
   */
  position_sum: number;
  /**
   * Source-specific fields, e.g. Bing cited_pages or a snapshot's period label.
   * A GSC `total` row keeps the property it came from.
   */
  extra?: Record<string, unknown>;
};

export type SeoMetricsStore = {
  /** The newest day stored from this property. */
  latestDate(source: string, property: string): Promise<string | null>;
  /** Days from `from` on whose total row came from this property: every dimension of them is stored. */
  storedDays(source: string, property: string, from: string): Promise<string[]>;
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

/**
 * The days Search Console has and this property's rows do not, cut into at most
 * `max` windows of up to BACKFILL_WINDOW_DAYS each, newest first. A window may
 * span stored days in between; those are fetched again, which is harmless.
 */
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
  /** The recent window, fetched every run. */
  startDate: string;
  endDate: string;
  rows: Record<SeoDimension, number>;
  /** History loaded this run, newest first. */
  backfilled: DateWindow[];
  /** Days Search Console has that are still to load; 0 once the history is complete. */
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
    /** Epoch ms after which no new history window starts. */
    deadline?: number;
  },
): Promise<GscIngestSummary> {
  const { today, property } = opts;
  const deadline = opts.deadline ?? Date.now() + BACKFILL_BUDGET_MS;

  const recent = planWindow(await store.latestDate(GSC_SOURCE, property), today);
  const rows = await ingestWindow(store, client, property, recent);

  // History: every day Search Console has for this property that is not stored
  // from it yet. That is the 16 months after a first run or a property switch,
  // and any day a failed run missed. One request lists the days.
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
      // At most MAX_HISTORY_DAYS + 1 rows, under PostgREST's 1000-row cap.
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

/** Cron entry point: a logged no-op when GSC is not configured. */
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
