import { describe, expect, it } from "vitest";
import { queryPageKey } from "@/lib/seo-metrics/ingest-gsc";
import { buildMovers, buildWatchlist, normalizeQuery } from "@/lib/seo-metrics/queries";

const t = (key: string, clicks: number, impressions: number, position = 5) => ({
  key,
  clicks,
  impressions,
  position_sum: position * impressions,
});

describe("normalizeQuery", () => {
  it("matches Search Console's lower-cased, single-spaced form", () => {
    expect(normalizeQuery("  Custom   Pillow Singapore ")).toBe("custom pillow singapore");
  });
});

describe("buildMovers", () => {
  it("ranks gainers and losers by click change and ignores thin queries", () => {
    const { gainers, losers } = buildMovers(
      [t("custom pillow", 40, 400), t("bolster", 5, 100), t("new query", 12, 80), t("tiny", 3, 5)],
      [t("custom pillow", 10, 300, 8), t("bolster", 20, 150), t("gone", 0, 0), t("tiny", 0, 4)],
    );
    expect(gainers.map((g) => g.key)).toEqual(["custom pillow", "new query"]);
    expect(gainers[0]).toMatchObject({ deltaClicks: 30, position: 5, previousPosition: 8 });
    expect(losers.map((l) => l.key)).toEqual(["bolster"]);
    expect(losers[0].deltaClicks).toBe(-15);
  });

  it("treats a key missing from the previous period as starting from zero", () => {
    const { gainers } = buildMovers([t("new", 10, 100)], []);
    expect(gainers[0]).toMatchObject({ previousClicks: 0, previousPosition: null });
  });
});

describe("buildWatchlist", () => {
  const today = "2026-09-25";
  const page = (p: string) => `https://custom.mpillow.com/en-US/${p}`;

  it("reports totals, position change, ranking page and competing pages", () => {
    const [row, missing] = buildWatchlist({
      targets: ["custom pillow singapore", "tech neck pillow singapore"],
      current: [t("custom pillow singapore", 30, 600, 6)],
      previous: [t("custom pillow singapore", 20, 500, 9)],
      daily: [
        { date: "2026-09-08", ...t("custom pillow singapore", 3, 60, 7) },
        { date: "2026-09-15", ...t("custom pillow singapore", 4, 50, 5) },
      ],
      queryPages: [
        t(queryPageKey("custom pillow singapore", page("mp-config")), 25, 400),
        t(queryPageKey("custom pillow singapore", page("blog/custom-made-pillow")), 4, 150),
        t(queryPageKey("custom pillow singapore", page("faq")), 1, 50),
      ],
      today,
    });
    expect(row).toMatchObject({ query: "custom pillow singapore", clicks: 30, position: 6, previousPosition: 9 });
    expect(row.topPage).toBe(page("mp-config"));
    expect(row.competingPages).toEqual([page("blog/custom-made-pillow")]);
    expect(row.spark).toHaveLength(12);
    expect(row.spark.filter((v) => v !== null)).toEqual([7, 5]);

    expect(missing).toMatchObject({ clicks: 0, position: null, topPage: null, competingPages: [] });
  });
});
