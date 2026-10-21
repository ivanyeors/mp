import type { SeoMetricRow } from "@/lib/seo-metrics/ingest-gsc";
import { parseCsv } from "@/lib/csv";

// Lifted to lib/csv.ts when the Shopify customer import became its second caller.
export { parseCsv };

/**
 * Manual imports for AI-answer reports that have no API yet (slice 07,
 * PRD-search-visibility):
 *
 *  - Google Search Console → Performance → Generative AI → Export. A set of
 *    CSVs: Chart.csv (daily impressions) plus period totals for Pages,
 *    Countries, Devices, and Filters.csv describing the period.
 *  - Bing Webmaster Tools → AI Performance → Export
 *    (…_AIPerformanceOverviewStats_….csv): daily Copilot citations and the
 *    number of distinct pages cited.
 *
 * Rows land in `seo_daily_metrics` so the charts treat them like any other
 * source. Mapping:
 *  - gsc_genai  / total: impressions = AI Overview + AI Mode impressions
 *  - bing_ai    / total: impressions = citations (an "appearance" count);
 *                        extra.cited_pages = distinct pages cited
 *  - gsc_genai  / page_period | country_period | device_period: whole-period
 *    totals with no daily breakdown, stored on the import date with
 *    extra.period, never mixed into daily rollups.
 */

export type ReportKind =
  | "gsc_genai_chart"
  | "gsc_genai_pages"
  | "gsc_genai_countries"
  | "gsc_genai_devices"
  | "gsc_genai_filters"
  | "bing_ai_daily";

export const REPORT_LABELS: Record<ReportKind, string> = {
  gsc_genai_chart: "Google AI · daily impressions",
  gsc_genai_pages: "Google AI · top pages",
  gsc_genai_countries: "Google AI · countries",
  gsc_genai_devices: "Google AI · devices",
  gsc_genai_filters: "Google AI · filters",
  bing_ai_daily: "Bing AI · daily citations",
};

const norm = (h: string) => h.trim().toLowerCase();

export function detectReport(header: string[]): ReportKind | null {
  const h = header.map(norm).join("|");
  if (h === "date|impressions") return "gsc_genai_chart";
  if (h === "top pages|impressions") return "gsc_genai_pages";
  if (h === "country|impressions") return "gsc_genai_countries";
  if (h === "device|impressions") return "gsc_genai_devices";
  if (h === "filter|value") return "gsc_genai_filters";
  if (h === "date|citations|cited pages") return "bing_ai_daily";
  return null;
}

/** "2026-07-10" or Bing's "4/2/2026 12:00:00 AM" (US month/day) → YYYY-MM-DD. */
export function parseReportDate(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== iso ? null : iso;
}

function count(raw: string): number | null {
  const n = Number(raw.replace(/,/g, "").trim());
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

export type ParsedReport =
  | { ok: true; kind: ReportKind; rows: SeoMetricRow[]; period?: string; skipped: number }
  | { ok: false; error: string };

const PERIOD_DIMENSION = {
  gsc_genai_pages: "page_period",
  gsc_genai_countries: "country_period",
  gsc_genai_devices: "device_period",
} as const;

/**
 * Parse one export file. `importDate` dates the period snapshots; `period`
 * (from Filters.csv in the same upload) labels them.
 */
export function parseReport(text: string, opts: { importDate: string; period?: string }): ParsedReport {
  const table = parseCsv(text);
  if (!table.length) return { ok: false, error: "The file is empty." };
  const kind = detectReport(table[0]);
  if (!kind) {
    return {
      ok: false,
      error: `Unrecognised columns: ${table[0].join(", ")}. Expected a Search Console "Generative AI" export or a Bing "AI Performance" export.`,
    };
  }
  const body = table.slice(1);
  let skipped = 0;

  if (kind === "gsc_genai_filters") {
    const date = body.find((r) => norm(r[0] ?? "") === "date");
    return { ok: true, kind, rows: [], period: date?.[1]?.trim() || undefined, skipped: 0 };
  }

  const rows: SeoMetricRow[] = [];
  for (const r of body) {
    if (kind === "gsc_genai_chart" || kind === "bing_ai_daily") {
      const date = parseReportDate(r[0] ?? "");
      const value = count(r[1] ?? "");
      if (!date || value === null) {
        skipped++;
        continue;
      }
      const citedPages = kind === "bing_ai_daily" ? count(r[2] ?? "") : null;
      rows.push({
        date,
        source: kind === "bing_ai_daily" ? "bing_ai" : "gsc_genai",
        dimension: "total",
        key: "",
        clicks: 0,
        impressions: value,
        position_sum: 0,
        ...(citedPages !== null ? { extra: { cited_pages: citedPages } } : {}),
      });
    } else {
      const key = (r[0] ?? "").trim();
      const value = count(r[1] ?? "");
      if (!key || value === null) {
        skipped++;
        continue;
      }
      rows.push({
        date: opts.importDate,
        source: "gsc_genai",
        dimension: PERIOD_DIMENSION[kind] as SeoMetricRow["dimension"],
        key,
        clicks: 0,
        impressions: value,
        position_sum: 0,
        extra: { period: opts.period ?? "unknown" },
      });
    }
  }
  // The same (date, key) twice in one file would make the upsert touch a row twice; merge them.
  const merged = new Map<string, SeoMetricRow>();
  for (const r of rows) {
    const id = `${r.date}|${r.dimension}|${r.key}`;
    const prev = merged.get(id);
    if (!prev) merged.set(id, r);
    else {
      prev.impressions += r.impressions;
      if (typeof r.extra?.cited_pages === "number" && typeof prev.extra?.cited_pages === "number") {
        prev.extra = { ...prev.extra, cited_pages: Math.max(prev.extra.cited_pages, r.extra.cited_pages) };
      }
    }
  }
  return { ok: true, kind, rows: [...merged.values()], skipped };
}

/**
 * Bing names exports after the verified site ("www.mpillow.com_AIPerformance…csv").
 * Warn when that is not the canonical host, so a report for another property is
 * not read as this site's numbers.
 */
export function siteMismatchWarning(fileName: string, canonicalHost: string): string | null {
  const m = fileName.toLowerCase().match(/^((?:[a-z0-9-]+\.)+[a-z]{2,})_/);
  if (!m || m[1] === canonicalHost.toLowerCase()) return null;
  return `This export is for ${m[1]}, not ${canonicalHost}. Add ${canonicalHost} in Bing Webmaster Tools to track the live site.`;
}
