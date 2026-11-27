import { describe, expect, it } from "vitest";
import { createGscClient, type GscInspection, type GscInspector } from "@/lib/google/search-console";
import {
  buildIndexingReport,
  inspectionIssue,
  planInspections,
  runUrlInspections,
  type StoredInspection,
  type UrlInspectionRow,
  type UrlInspectionStore,
} from "@/lib/seo-metrics/inspect-urls";

const SITE = "sc-domain:mpillow.com";
const NOW = "2026-11-27T02:00:00.000Z";

const indexed: GscInspection = {
  indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed" },
};
const state = (coverageState: string, extra: GscInspection["indexStatusResult"] = {}): GscInspection => ({
  indexStatusResult: { verdict: "NEUTRAL", coverageState, ...extra },
});

function memoryStore(seed: StoredInspection[] = []) {
  const rows = new Map<string, UrlInspectionRow | StoredInspection>(seed.map((r) => [r.url, r]));
  const store: UrlInspectionStore = {
    async existing() {
      return [...rows.values()];
    },
    async upsert(batch) {
      for (const row of batch) rows.set(row.url, row);
    },
  };
  return { store, rows };
}

function fakeInspector(results: Record<string, GscInspection | Error>) {
  const asked: string[] = [];
  const client: GscInspector = {
    async inspectUrl(url) {
      asked.push(url);
      const result = results[url] ?? indexed;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { client, asked };
}

describe("createGscClient.inspectUrl", () => {
  it("asks the inspection endpoint for the URL under the configured property", async () => {
    const calls: { url: string; body: unknown; auth: string | undefined }[] = [];
    const client = createGscClient(
      { siteUrl: SITE, clientEmail: "sa@x.iam", privateKey: "k" },
      {
        getToken: async () => "token",
        fetchImpl: async (url, init) => {
          calls.push({
            url,
            body: JSON.parse(String(init.body)),
            auth: (init.headers as Record<string, string>).Authorization,
          });
          return new Response(JSON.stringify({ inspectionResult: indexed }), { status: 200 });
        },
      },
    );

    expect(await client.inspectUrl("https://www.mpillow.com/en-US/shop")).toEqual(indexed);
    expect(calls).toEqual([
      {
        url: "https://searchconsole.googleapis.com/v1/urlInspection/index:inspect",
        body: { inspectionUrl: "https://www.mpillow.com/en-US/shop", siteUrl: SITE },
        auth: "Bearer token",
      },
    ]);
  });

  it("reports a refusal with Google's status and message", async () => {
    const client = createGscClient(
      { siteUrl: SITE, clientEmail: "sa@x.iam", privateKey: "k" },
      { getToken: async () => "token", fetchImpl: async () => new Response("no permission", { status: 403 }) },
    );
    await expect(client.inspectUrl("https://www.mpillow.com/")).rejects.toThrow("Search Console 403: no permission");
  });
});

describe("inspectionIssue", () => {
  it("is nothing for an indexed page", () => {
    expect(inspectionIssue(indexed, true)).toBeNull();
    expect(inspectionIssue(indexed, false)).toBeNull();
  });

  it("names Google's state for a sitemap page that is not indexed, whatever the state", () => {
    expect(inspectionIssue(state("Crawled - currently not indexed"), true)).toBe("Crawled - currently not indexed");
    expect(inspectionIssue(state("Page with redirect"), true)).toBe("Page with redirect");
    expect(inspectionIssue(state("Alternate page with proper canonical tag"), true)).toBe(
      "Alternate page with proper canonical tag",
    );
    expect(
      inspectionIssue(state("Excluded by ‘noindex’ tag", { indexingState: "BLOCKED_BY_META_TAG" }), true),
    ).toBe("Excluded by ‘noindex’ tag");
  });

  it("lets a page outside the sitemap redirect, defer to a canonical or carry noindex", () => {
    expect(inspectionIssue(state("Page with redirect"), false)).toBeNull();
    expect(inspectionIssue(state("Alternate page with proper canonical tag"), false)).toBeNull();
    expect(
      inspectionIssue(state("Excluded by ‘noindex’ tag", { indexingState: "BLOCKED_BY_HTTP_HEADER" }), false),
    ).toBeNull();
  });

  it("still flags a page outside the sitemap that is broken", () => {
    expect(inspectionIssue(state("Not found (404)", { pageFetchState: "NOT_FOUND" }), false)).toBe("Not found (404)");
    expect(inspectionIssue(state("Server error (5xx)", { verdict: "FAIL" }), false)).toBe("Server error (5xx)");
    expect(inspectionIssue(state("Duplicate without user-selected canonical"), false)).toBe(
      "Duplicate without user-selected canonical",
    );
  });

  it("falls back to a plain label when Google gives no state", () => {
    expect(inspectionIssue({}, true)).toBe("Not indexed");
  });

  it("flags structured data errors on an indexed page, and ignores warnings", () => {
    const withIssues = (severity: string): GscInspection => ({
      ...indexed,
      richResultsResult: {
        detectedItems: [
          {
            richResultType: "Product snippets",
            items: [
              { issues: [{ issueMessage: "Missing field 'price'", severity }] },
              { issues: [{ issueMessage: "Missing field 'price'", severity }] },
            ],
          },
        ],
      },
    });
    expect(inspectionIssue(withIssues("ERROR"), true)).toBe("Structured data: Product snippets: Missing field 'price'");
    expect(inspectionIssue(withIssues("WARNING"), true)).toBeNull();
  });
});

describe("planInspections", () => {
  const stored = (url: string, inspected_at: string): StoredInspection => ({
    url,
    issue: null,
    issue_since: null,
    inspected_at,
  });

  it("takes never-checked pages first, then the longest unchecked, up to the limit", () => {
    const plan = planInspections(
      [
        { url: "https://x/recent", inSitemap: true },
        { url: "https://x/old", inSitemap: true },
        { url: "https://x/new", inSitemap: false },
        { url: "https://x/newer", inSitemap: false },
      ],
      [stored("https://x/recent", "2026-11-26T02:00:00Z"), stored("https://x/old", "2026-11-20T02:00:00Z")],
      3,
    );
    expect(plan.map((t) => t.url)).toEqual(["https://x/new", "https://x/newer", "https://x/old"]);
  });

  it("checks a URL once, as a sitemap page when any source says so", () => {
    expect(
      planInspections(
        [
          { url: "https://x/a", inSitemap: false },
          { url: "https://x/a", inSitemap: true },
        ],
        [],
        10,
      ),
    ).toEqual([{ url: "https://x/a", inSitemap: true }]);
  });
});

describe("runUrlInspections", () => {
  const targets = [
    { url: "https://x/a", inSitemap: true },
    { url: "https://x/b", inSitemap: true },
    { url: "https://x/c", inSitemap: false },
  ];

  it("stores one row per page with its issue", async () => {
    const { store, rows } = memoryStore();
    const { client } = fakeInspector({
      "https://x/b": state("Crawled - currently not indexed", { lastCrawlTime: "2026-11-25T08:00:00Z" }),
      "https://x/c": state("Page with redirect"),
    });

    const summary = await runUrlInspections(store, client, { targets, property: SITE, now: NOW, deadline: Infinity });

    expect(summary).toEqual({ ok: true, property: SITE, inspected: 3, issues: 1, failed: 0, remaining: 0 });
    expect(rows.get("https://x/a")).toMatchObject({ issue: null, issue_since: null, verdict: "PASS", in_sitemap: true });
    expect(rows.get("https://x/b")).toMatchObject({
      issue: "Crawled - currently not indexed",
      issue_since: NOW,
      last_crawl_time: "2026-11-25T08:00:00Z",
      inspected_at: NOW,
      property: SITE,
    });
    expect(rows.get("https://x/c")).toMatchObject({ issue: null, in_sitemap: false });
  });

  it("keeps the first-seen date while an issue persists, restarts it when the issue changes, clears it when fixed", async () => {
    const earlier = "2026-11-10T02:00:00.000Z";
    const seed = (url: string, issue: string): StoredInspection => ({
      url,
      issue,
      issue_since: earlier,
      inspected_at: earlier,
    });
    const { store, rows } = memoryStore([
      seed("https://x/a", "Not found (404)"),
      seed("https://x/b", "Not found (404)"),
      seed("https://x/c", "Not found (404)"),
    ]);
    const { client } = fakeInspector({
      "https://x/a": state("Not found (404)"),
      "https://x/b": state("Soft 404"),
      "https://x/c": indexed,
    });

    await runUrlInspections(store, client, { targets, property: SITE, now: NOW, deadline: Infinity });

    expect(rows.get("https://x/a")).toMatchObject({ issue: "Not found (404)", issue_since: earlier });
    expect(rows.get("https://x/b")).toMatchObject({ issue: "Soft 404", issue_since: NOW });
    expect(rows.get("https://x/c")).toMatchObject({ issue: null, issue_since: null });
  });

  it("keeps what it learned when one page fails, and says so", async () => {
    const { store, rows } = memoryStore();
    const { client } = fakeInspector({ "https://x/b": new Error("Search Console 500: boom") });

    const summary = await runUrlInspections(store, client, {
      targets,
      property: SITE,
      now: NOW,
      deadline: Infinity,
      concurrency: 1,
    });

    expect(summary).toMatchObject({ ok: false, inspected: 2, failed: 1, error: "Search Console 500: boom" });
    expect([...rows.keys()].sort()).toEqual(["https://x/a", "https://x/c"]);
  });

  it("gives up after repeated refusals instead of asking for every page", async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ url: `https://x/${i}`, inSitemap: true }));
    const { store } = memoryStore();
    const { client, asked } = fakeInspector(
      Object.fromEntries(many.map((t) => [t.url, new Error("Search Console 403: no permission")])),
    );

    const summary = await runUrlInspections(store, client, {
      targets: many,
      property: SITE,
      now: NOW,
      deadline: Infinity,
      concurrency: 1,
    });

    expect(asked).toHaveLength(5);
    expect(summary).toMatchObject({ ok: false, inspected: 0, failed: 5, remaining: 35 });
  });

  it("stops at the time limit and leaves the rest for the next run", async () => {
    const { store } = memoryStore();
    const { client, asked } = fakeInspector({});
    const summary = await runUrlInspections(store, client, { targets, property: SITE, now: NOW, deadline: 0 });
    expect(asked).toEqual([]);
    expect(summary).toMatchObject({ inspected: 0, remaining: 3 });
  });
});

describe("buildIndexingReport", () => {
  const row = (url: string, issue: string | null, inspected_at = NOW) => ({
    url,
    in_sitemap: true,
    issue,
    issue_since: issue ? NOW : null,
    last_crawl_time: null,
    inspection_link: null,
    verdict: issue ? "NEUTRAL" : "PASS",
    inspected_at,
  });

  it("groups pages by issue, biggest group first, and counts what was checked", () => {
    const report = buildIndexingReport(
      [
        row("https://x/ok", null),
        row("https://x/b", "Not found (404)"),
        row("https://x/a", "Not found (404)"),
        row("https://x/c", "Soft 404"),
      ],
      "2026-11-27",
    );
    expect(report.checked).toBe(4);
    expect(report.indexed).toBe(1);
    expect(report.lastChecked).toBe(NOW);
    expect(report.groups.map((g) => [g.issue, g.pages.map((p) => p.url)])).toEqual([
      ["Not found (404)", ["https://x/a", "https://x/b"]],
      ["Soft 404", ["https://x/c"]],
    ]);
  });

  it("drops a page that has not been checked for two weeks, such as one removed from the site", () => {
    const report = buildIndexingReport(
      [row("https://x/gone", "Not found (404)", "2026-11-01T02:00:00.000Z"), row("https://x/ok", null)],
      "2026-11-27",
    );
    expect(report.checked).toBe(1);
    expect(report.groups).toEqual([]);
  });
});
