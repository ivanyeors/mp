import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createGscClient,
  getGscConfig,
  type GscInspection,
  type GscInspector,
} from "@/lib/google/search-console";
import { addDays } from "@/lib/seo-metrics/dates";
import { GSC_SOURCE } from "@/lib/seo-metrics/ingest-gsc";

// ponytail: 300 pages a run covers a site of 4,200 pages inside FRESH_DAYS; Google allows 2,000
// inspections a day per property, so a bigger site raises this number before it needs its own cron.
export const INSPECT_LIMIT_PER_RUN = 300;
export const INSPECT_BUDGET_MS = 60_000;
export const INSPECT_CONCURRENCY = 4;
export const FRESH_DAYS = 14;
export const IMPRESSION_PAGE_DAYS = 90;

export type InspectionTarget = { url: string; inSitemap: boolean };

export type UrlInspectionRow = {
  url: string;
  property: string;
  in_sitemap: boolean;
  verdict: string | null;
  coverage_state: string | null;
  indexing_state: string | null;
  robots_txt_state: string | null;
  page_fetch_state: string | null;
  last_crawl_time: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  issue: string | null;
  issue_since: string | null;
  inspection_link: string | null;
  inspected_at: string;
  attempted_at: string;
  error: null;
};

export type FailedInspection = Pick<UrlInspectionRow, "url" | "property" | "in_sitemap" | "attempted_at"> & {
  error: string;
};

export type StoredInspection = Pick<UrlInspectionRow, "url" | "issue" | "issue_since" | "attempted_at"> & {
  error: string | null;
};

export type UrlInspectionStore = {
  existing(): Promise<StoredInspection[]>;
  upsert(rows: UrlInspectionRow[]): Promise<void>;
  recordFailures(rows: FailedInspection[]): Promise<void>;
};

const EXPECTED_OFF_SITEMAP_STATES = ["page with redirect", "alternate page with proper canonical tag"];
const NOINDEX_STATES = ["BLOCKED_BY_META_TAG", "BLOCKED_BY_HTTP_HEADER"];

function structuredDataErrors(result: GscInspection): string[] {
  const messages = (result.richResultsResult?.detectedItems ?? []).flatMap((detected) =>
    (detected.items ?? []).flatMap((item) =>
      (item.issues ?? [])
        .filter((issue) => issue.severity === "ERROR" && issue.issueMessage)
        .map((issue) => `${detected.richResultType ?? "Rich result"}: ${issue.issueMessage}`),
    ),
  );
  return [...new Set(messages)];
}

export function inspectionIssue(result: GscInspection, inSitemap: boolean): string | null {
  const index = result.indexStatusResult ?? {};
  if (index.verdict === "PASS") {
    const errors = structuredDataErrors(result);
    return errors.length ? `Structured data: ${errors.join("; ")}` : null;
  }
  const state = index.coverageState?.trim() || "Not indexed";
  const deliberate =
    NOINDEX_STATES.includes(index.indexingState ?? "") || EXPECTED_OFF_SITEMAP_STATES.includes(state.toLowerCase());
  return !inSitemap && deliberate ? null : state;
}

export function planInspections(
  targets: InspectionTarget[],
  existing: StoredInspection[],
  limit: number,
): InspectionTarget[] {
  const byUrl = new Map<string, InspectionTarget>();
  for (const target of targets) {
    const seen = byUrl.get(target.url);
    byUrl.set(target.url, { url: target.url, inSitemap: target.inSitemap || (seen?.inSitemap ?? false) });
  }
  const stored = new Map(existing.map((row) => [row.url, row]));
  const turn = (url: string) => `${stored.get(url)?.error ? 1 : 0}${stored.get(url)?.attempted_at ?? ""}`;
  return [...byUrl.values()]
    .sort((a, b) => turn(a.url).localeCompare(turn(b.url)))
    .slice(0, limit);
}

export function toInspectionRow(
  target: InspectionTarget,
  result: GscInspection,
  previous: StoredInspection | undefined,
  opts: { property: string; now: string },
): UrlInspectionRow {
  const index = result.indexStatusResult ?? {};
  const issue = inspectionIssue(result, target.inSitemap);
  return {
    url: target.url,
    property: opts.property,
    in_sitemap: target.inSitemap,
    verdict: index.verdict ?? null,
    coverage_state: index.coverageState ?? null,
    indexing_state: index.indexingState ?? null,
    robots_txt_state: index.robotsTxtState ?? null,
    page_fetch_state: index.pageFetchState ?? null,
    last_crawl_time: index.lastCrawlTime ?? null,
    google_canonical: index.googleCanonical ?? null,
    user_canonical: index.userCanonical ?? null,
    issue,
    issue_since: issue ? (previous?.issue === issue ? (previous.issue_since ?? opts.now) : opts.now) : null,
    inspection_link: result.inspectionResultLink ?? null,
    inspected_at: opts.now,
    attempted_at: opts.now,
    error: null,
  };
}

export type UrlInspectionSummary = {
  ok: boolean;
  property: string;
  inspected: number;
  issues: number;
  failed: number;
  remaining: number;
  error?: string;
};

export async function runUrlInspections(
  store: UrlInspectionStore,
  client: GscInspector,
  opts: {
    targets: InspectionTarget[];
    property: string;
    now: string;
    limit?: number;
    deadline?: number;
    concurrency?: number;
  },
): Promise<UrlInspectionSummary> {
  const deadline = opts.deadline ?? Date.now() + INSPECT_BUDGET_MS;
  const existing = await store.existing();
  const previous = new Map(existing.map((row) => [row.url, row]));
  const queue = planInspections(opts.targets, existing, opts.limit ?? INSPECT_LIMIT_PER_RUN);

  const rows: UrlInspectionRow[] = [];
  const failures: FailedInspection[] = [];

  async function worker() {
    while (queue.length > 0 && Date.now() < deadline) {
      const target = queue.shift()!;
      try {
        const result = await client.inspectUrl(target.url);
        rows.push(toInspectionRow(target, result, previous.get(target.url), opts));
      } catch (e) {
        failures.push({
          url: target.url,
          property: opts.property,
          in_sitemap: target.inSitemap,
          attempted_at: opts.now,
          error: e instanceof Error ? e.message : "URL inspection failed",
        });
      }
    }
  }

  await Promise.all(Array.from({ length: opts.concurrency ?? INSPECT_CONCURRENCY }, worker));
  await store.upsert(rows);
  await store.recordFailures(failures);
  const failed = failures.length;
  const error = failures[0]?.error;

  return {
    ok: failed === 0,
    property: opts.property,
    inspected: rows.length,
    issues: rows.filter((row) => row.issue).length,
    failed,
    remaining: queue.length,
    ...(error ? { error } : {}),
  };
}

const PAGE = 1000;

export function createSupabaseUrlInspectionStore(admin: SupabaseClient): UrlInspectionStore {
  return {
    async existing() {
      const out: StoredInspection[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .from("seo_url_inspections")
          .select("url, issue, issue_since, attempted_at, error")
          .order("url", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`seo_url_inspections read: ${error.message}`);
        out.push(...((data ?? []) as StoredInspection[]));
        if (!data || data.length < PAGE) return out;
      }
    },
    async upsert(rows) {
      for (let i = 0; i < rows.length; i += PAGE) {
        const { error } = await admin
          .from("seo_url_inspections")
          .upsert(rows.slice(i, i + PAGE), { onConflict: "url" });
        if (error) throw new Error(`seo_url_inspections upsert: ${error.message}`);
      }
    },
    async recordFailures(rows) {
      if (rows.length === 0) return;
      const { error } = await admin.from("seo_url_inspections").upsert(rows, { onConflict: "url" });
      if (error) throw new Error(`seo_url_inspections failures: ${error.message}`);
    },
  };
}

export async function pagesWithImpressions(admin: SupabaseClient, today: string): Promise<string[]> {
  const pages: { key: string; impressions: number }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .rpc("seo_metric_rollup", {
        p_source: GSC_SOURCE,
        p_dimension: "page",
        p_from: addDays(today, -IMPRESSION_PAGE_DAYS),
        p_to: today,
      })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`seo_metric_rollup pages: ${error.message}`);
    pages.push(...((data ?? []) as { key: string; impressions: number }[]));
    if (!data || data.length < PAGE) break;
  }
  return pages
    .filter((p) => /^https?:\/\//.test(p.key) && !p.key.includes("#"))
    .sort((a, b) => Number(b.impressions) - Number(a.impressions))
    .map((p) => p.key);
}

export async function runUrlInspectionsFromEnv(
  admin: SupabaseClient,
  sitemapUrls: string[],
): Promise<UrlInspectionSummary | { ok: true; skipped: string }> {
  const config = getGscConfig();
  if (!config) return { ok: true, skipped: "Search Console env not set" };
  const now = new Date().toISOString();
  const offSitemap = await pagesWithImpressions(admin, now.slice(0, 10));
  return runUrlInspections(createSupabaseUrlInspectionStore(admin), createGscClient(config), {
    targets: [
      ...sitemapUrls.map((url) => ({ url, inSitemap: true })),
      ...offSitemap.map((url) => ({ url, inSitemap: false })),
    ],
    property: config.siteUrl,
    now,
  });
}

export type IndexingIssue = Pick<
  UrlInspectionRow,
  "url" | "in_sitemap" | "issue" | "issue_since" | "last_crawl_time" | "inspection_link"
>;

export type IndexingReport = {
  checked: number;
  indexed: number;
  unchecked: number;
  lastChecked: string | null;
  groups: { issue: string; pages: IndexingIssue[] }[];
};

export type IndexingReportRow = IndexingIssue & {
  verdict: string | null;
  inspected_at: string | null;
  attempted_at: string;
  error: string | null;
};

export function buildIndexingReport(rows: IndexingReportRow[], today: string): IndexingReport {
  const since = addDays(today, -FRESH_DAYS);
  const fresh = rows.filter(
    (row): row is IndexingReportRow & { inspected_at: string } =>
      row.inspected_at !== null && row.inspected_at.slice(0, 10) >= since,
  );
  const groups = new Map<string, IndexingIssue[]>();
  for (const row of fresh) {
    if (!row.issue) continue;
    const list = groups.get(row.issue) ?? [];
    list.push({
      url: row.url,
      in_sitemap: row.in_sitemap,
      issue: row.issue,
      issue_since: row.issue_since,
      last_crawl_time: row.last_crawl_time,
      inspection_link: row.inspection_link,
    });
    groups.set(row.issue, list);
  }
  return {
    checked: fresh.length,
    indexed: fresh.filter((row) => row.verdict === "PASS").length,
    unchecked: rows.filter((row) => row.error !== null && row.attempted_at.slice(0, 10) >= since).length,
    lastChecked: fresh.map((row) => row.inspected_at).sort().at(-1) ?? null,
    groups: [...groups.entries()]
      .map(([issue, pages]) => ({ issue, pages: pages.sort((a, b) => a.url.localeCompare(b.url)) }))
      .sort((a, b) => b.pages.length - a.pages.length || a.issue.localeCompare(b.issue)),
  };
}
