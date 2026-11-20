import { describe, expect, it } from "vitest";
import { createGscClient, GSC_ROW_LIMIT, type GscClient, type GscRow } from "@/lib/google/search-console";
import {
  addDays,
  backfillWindows,
  planWindow,
  queryPageKey,
  splitQueryPageKey,
  runGscIngest,
  toMetricRows,
  type SeoMetricRow,
  type SeoMetricsStore,
} from "@/lib/seo-metrics/ingest-gsc";

const config = { siteUrl: "sc-domain:mpillow.com", clientEmail: "sa@x.iam", privateKey: "k" };

function row(keys: string[], clicks = 1, impressions = 10, position = 4): GscRow {
  return { keys, clicks, impressions, ctr: clicks / impressions, position };
}

/** Like the Supabase store: a day counts as stored from a property when its total row came from it. */
function memoryStore() {
  const rows = new Map<string, SeoMetricRow>();
  const totalsFrom = (property: string) =>
    [...rows.values()].filter((r) => r.dimension === "total" && r.extra?.property === property).map((r) => r.date);
  const store: SeoMetricsStore = {
    async latestDate(_source, property) {
      return totalsFrom(property).sort().at(-1) ?? null;
    },
    async storedDays(_source, property, from) {
      return totalsFrom(property).filter((d) => d >= from);
    },
    async upsert(batch) {
      for (const r of batch) rows.set(`${r.date}|${r.source}|${r.dimension}|${r.key}`, r);
    },
  };
  return { store, rows, totalsFrom };
}

/** Every day from `from` to `to`, inclusive. */
function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** A Search Console property with data on `days`: one row per day for each dimension. */
function fakeGsc(days: string[], opts: { failOn?: string } = {}) {
  const requests: { startDate: string; endDate: string; dimensions: string[] }[] = [];
  const client: GscClient = {
    async queryAll(q) {
      requests.push(q);
      if (opts.failOn && q.dimensions.includes(opts.failOn as never)) throw new Error("Search Console 500");
      return days
        .filter((d) => d >= q.startDate && d <= q.endDate)
        .map((d) => row([d, ...q.dimensions.slice(1).map((dim) => `${dim}-a`)]));
    },
  };
  return { client, requests };
}

const SITE = "sc-domain:mpillow.com";

describe("planWindow", () => {
  it("re-fetches the last 3 settling days after the newest stored date", () => {
    expect(planWindow("2026-09-20", "2026-09-25")).toEqual({ startDate: "2026-09-17", endDate: "2026-09-25" });
  });

  it("takes a bounded first slice when nothing is stored", () => {
    expect(planWindow(null, "2026-09-25")).toEqual({ startDate: "2026-08-26", endDate: "2026-09-25" });
  });

  it("never asks for dates older than GSC retains", () => {
    expect(planWindow("2020-01-01", "2026-09-25").startDate).toBe("2025-05-27");
  });
});

describe("toMetricRows", () => {
  it("stores impression-weighted position, and an empty key and the property for totals", () => {
    expect(toMetricRows("total", [row(["2026-09-01"], 3, 50, 7.5)], SITE)).toEqual([
      {
        date: "2026-09-01",
        source: "gsc_web",
        dimension: "total",
        key: "",
        clicks: 3,
        impressions: 50,
        position_sum: 375,
        extra: { property: SITE },
      },
    ]);
    const query = toMetricRows("query", [row(["2026-09-01", "custom pillow singapore"])], SITE)[0];
    expect(query.key).toBe("custom pillow singapore");
    expect(query.extra).toBeUndefined();
  });
});

describe("queryPageKey", () => {
  it("round-trips query and page", () => {
    expect(splitQueryPageKey(queryPageKey("custom pillow", "https://x/y?a=1"))).toEqual({ query: "custom pillow", page: "https://x/y?a=1" });
  });
});

describe("createGscClient", () => {
  it("follows startRow pagination until a short page, and encodes the property id", async () => {
    const calls: { url: string; startRow: number }[] = [];
    const client = createGscClient(config, {
      getToken: async () => "t",
      fetchImpl: async (url, init) => {
        const { startRow } = JSON.parse(String(init.body));
        calls.push({ url, startRow });
        const n = startRow === 0 ? GSC_ROW_LIMIT : 2;
        return new Response(JSON.stringify({ rows: Array.from({ length: n }, () => row(["2026-09-01"])) }));
      },
    });
    const rows = await client.queryAll({ startDate: "2026-09-01", endDate: "2026-09-01", dimensions: ["date"] });
    expect(rows).toHaveLength(GSC_ROW_LIMIT + 2);
    expect(calls.map((c) => c.startRow)).toEqual([0, GSC_ROW_LIMIT]);
    expect(calls[0].url).toContain("/sites/sc-domain%3Ampillow.com/searchAnalytics/query");
  });

  it("returns [] for a property with no data and throws on a non-retryable error", async () => {
    const empty = createGscClient(config, { getToken: async () => "t", fetchImpl: async () => new Response("{}") });
    expect(await empty.queryAll({ startDate: "a", endDate: "b", dimensions: ["date"] })).toEqual([]);

    const denied = createGscClient(config, {
      getToken: async () => "t",
      fetchImpl: async () => new Response("User does not have sufficient permission", { status: 403 }),
    });
    await expect(denied.queryAll({ startDate: "a", endDate: "b", dimensions: ["date"] })).rejects.toThrow(/403/);
  });
});

describe("backfillWindows", () => {
  it("cuts the missing days into 30-day windows, newest first, at most `max`", () => {
    const days = daysBetween("2026-01-01", "2026-04-30"); // 120 days
    const stored = new Set(daysBetween("2026-04-01", "2026-04-30"));
    expect(backfillWindows(days, stored, 2)).toEqual([
      { startDate: "2026-03-02", endDate: "2026-03-31" },
      { startDate: "2026-01-31", endDate: "2026-03-01" },
    ]);
    expect(backfillWindows(days, stored, 10).at(-1)).toEqual({ startDate: "2026-01-01", endDate: "2026-01-30" });
  });

  it("asks for nothing once every day Search Console has is stored", () => {
    const days = daysBetween("2026-01-01", "2026-01-10");
    expect(backfillWindows(days, new Set(days), 4)).toEqual([]);
  });

  it("starts a window at the oldest missing day inside it, not 30 days back", () => {
    expect(backfillWindows(["2026-03-01", "2026-03-05", "2026-03-31"], new Set(["2026-03-31"]), 4)).toEqual([
      { startDate: "2026-03-01", endDate: "2026-03-05" },
    ]);
  });
});

describe("runGscIngest", () => {
  const today = "2026-11-20";
  // Search Console has data from 1 Jan to yesterday: 323 days.
  const gscDays = daysBetween("2026-01-01", "2026-11-19");

  it("loads the whole history over a few runs on its own, then only refreshes the recent days", async () => {
    const { store, rows, totalsFrom } = memoryStore();
    const { client, requests } = fakeGsc(gscDays);

    const first = await runGscIngest(store, client, { today, property: SITE });
    expect(first).toMatchObject({ startDate: "2026-10-21", endDate: today }); // a first slice of 30 days
    expect(first.backfilled).toEqual([
      { startDate: "2026-09-21", endDate: "2026-10-20" },
      { startDate: "2026-08-22", endDate: "2026-09-20" },
      { startDate: "2026-07-23", endDate: "2026-08-21" },
      { startDate: "2026-06-23", endDate: "2026-07-22" },
    ]);
    expect(first.missingDays).toBe(323 - 30 - 120);

    const second = await runGscIngest(store, client, { today, property: SITE });
    expect(second.startDate).toBe("2026-11-16");
    expect(second.missingDays).toBe(53);
    const third = await runGscIngest(store, client, { today, property: SITE });
    expect(third.backfilled).toHaveLength(2);
    expect(third.missingDays).toBe(0);

    // Every day, every dimension, and each day's total marked with the property.
    expect(totalsFrom(SITE).sort()).toEqual(gscDays);
    for (const dim of ["query", "page", "query_page", "country", "device"]) {
      expect([...rows.values()].filter((r) => r.dimension === dim)).toHaveLength(gscDays.length);
    }

    // Complete: the next run refreshes 5 recent days with one listing request and no history window.
    requests.length = 0;
    const fourth = await runGscIngest(store, client, { today, property: SITE });
    expect(fourth).toMatchObject({ backfilled: [], missingDays: 0 });
    expect(requests.map((r) => `${r.startDate}..${r.endDate}`)).toEqual([
      ...Array(6).fill("2026-11-16..2026-11-20"),
      "2025-07-22..2026-11-20",
    ]);
    const size = rows.size;
    await runGscIngest(store, client, { today, property: SITE });
    expect(rows.size).toBe(size);
  });

  it("treats days stored from another property as missing, so a switch reloads them", async () => {
    const { store, totalsFrom } = memoryStore();
    const old = fakeGsc(gscDays).client;
    await runGscIngest(store, old, { today, property: "https://custom.mpillow.com/", maxBackfillWindows: Infinity });
    expect(totalsFrom("https://custom.mpillow.com/")).toHaveLength(gscDays.length);

    const switched = await runGscIngest(store, fakeGsc(gscDays).client, { today, property: SITE });
    expect(switched.startDate).toBe("2026-10-21");
    expect(switched.backfilled).toHaveLength(4);
    expect(totalsFrom(SITE)).toHaveLength(30 + 120);
  });

  it("starts no history window after the deadline, and reports what is left", async () => {
    const { store } = memoryStore();
    const summary = await runGscIngest(store, fakeGsc(gscDays).client, { today, property: SITE, deadline: 0 });
    expect(summary.backfilled).toEqual([]);
    expect(summary.missingDays).toBe(323 - 30);
  });

  it("does not mark a day as stored when a dimension failed part-way", async () => {
    const { store, rows, totalsFrom } = memoryStore();
    await expect(runGscIngest(store, fakeGsc(gscDays, { failOn: "country" }).client, { today, property: SITE })).rejects.toThrow(
      /500/,
    );
    expect([...rows.values()].some((r) => r.dimension === "query")).toBe(true);
    expect(totalsFrom(SITE)).toEqual([]); // so the next run fetches those days again
  });
});
