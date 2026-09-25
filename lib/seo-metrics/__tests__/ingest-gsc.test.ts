import { describe, expect, it } from "vitest";
import { createGscClient, GSC_ROW_LIMIT, type GscRow } from "@/lib/google/search-console";
import {
  planWindow,
  runGscIngest,
  toMetricRows,
  type SeoMetricRow,
  type SeoMetricsStore,
} from "@/lib/seo-metrics/ingest-gsc";

const config = { siteUrl: "sc-domain:mpillow.com", clientEmail: "sa@x.iam", privateKey: "k" };

function row(keys: string[], clicks = 1, impressions = 10, position = 4): GscRow {
  return { keys, clicks, impressions, ctr: clicks / impressions, position };
}

function memoryStore(latest: string | null = null) {
  const rows = new Map<string, SeoMetricRow>();
  const store: SeoMetricsStore = {
    async latestDate() {
      return latest;
    },
    async upsert(batch) {
      for (const r of batch) rows.set(`${r.date}|${r.source}|${r.dimension}|${r.key}`, r);
    },
  };
  return { store, rows };
}

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
  it("stores impression-weighted position and an empty key for totals", () => {
    expect(toMetricRows("total", [row(["2026-09-01"], 3, 50, 7.5)])).toEqual([
      { date: "2026-09-01", source: "gsc_web", dimension: "total", key: "", clicks: 3, impressions: 50, position_sum: 375 },
    ]);
    expect(toMetricRows("query", [row(["2026-09-01", "custom pillow singapore"])])[0].key).toBe(
      "custom pillow singapore",
    );
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

describe("runGscIngest", () => {
  const client = {
    async queryAll({ dimensions }: { dimensions: string[] }) {
      return dimensions.length === 1
        ? [row(["2026-09-24"]), row(["2026-09-25"])]
        : [row(["2026-09-24", `${dimensions[1]}-a`]), row(["2026-09-24", `${dimensions[1]}-b`])];
    },
  };

  it("writes every dimension and is idempotent on re-run", async () => {
    const { store, rows } = memoryStore("2026-09-24");
    const first = await runGscIngest(store, client, { today: "2026-09-25" });
    expect(first.startDate).toBe("2026-09-21");
    expect(first.rows).toEqual({ total: 2, query: 2, page: 2, country: 2, device: 2 });
    expect(rows.size).toBe(10);

    await runGscIngest(store, client, { today: "2026-09-25" });
    expect(rows.size).toBe(10);
  });
});
