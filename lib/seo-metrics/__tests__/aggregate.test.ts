import { describe, expect, it } from "vitest";
import {
  bucketize,
  bucketStart,
  compareTotals,
  previousPeriod,
  sumBuckets,
  summarize,
  type DailyTotal,
} from "@/lib/seo-metrics/aggregate";

const day = (date: string, clicks: number, impressions: number, position: number): DailyTotal => ({
  date,
  clicks,
  impressions,
  position_sum: position * impressions,
});

describe("summarize", () => {
  it("recomputes CTR and impression-weighted position instead of averaging", () => {
    const t = summarize([day("2026-09-01", 50, 100, 2), day("2026-09-02", 10, 900, 10)]);
    expect(t.clicks).toBe(60);
    expect(t.impressions).toBe(1000);
    expect(t.ctr).toBeCloseTo(0.06);
    expect(t.position).toBeCloseTo(9.2);
  });

  it("returns null ratios, not zero, when there are no impressions", () => {
    expect(summarize([])).toEqual({ clicks: 0, impressions: 0, ctr: null, position: null });
  });
});

describe("bucketize", () => {
  it("starts weeks on Monday", () => {
    expect(bucketStart("2026-09-24", "week")).toBe("2026-09-21");
    expect(bucketStart("2026-09-21", "week")).toBe("2026-09-21");
    expect(bucketStart("2026-09-27", "week")).toBe("2026-09-21");
  });

  it("fills empty days and flags the reporting-lag days as partial", () => {
    const buckets = bucketize([day("2026-09-20", 3, 30, 5)], {
      from: "2026-09-20",
      to: "2026-09-25",
      granularity: "day",
      today: "2026-09-25",
    });
    expect(buckets.map((b) => b.start)).toEqual([
      "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25",
    ]);
    expect(buckets[0]).toMatchObject({ clicks: 3, impressions: 30, partial: false });
    expect(buckets[1]).toMatchObject({ clicks: 0, ctr: null, position: null });
    expect(buckets.map((b) => b.partial)).toEqual([false, false, false, true, true, true]);
  });

  it("rolls days into weeks and marks a week partial if any of its days are", () => {
    const rows = [day("2026-09-14", 1, 10, 4), day("2026-09-20", 1, 30, 8), day("2026-09-21", 5, 50, 3)];
    const weeks = bucketize(rows, { from: "2026-09-14", to: "2026-09-25", granularity: "week", today: "2026-09-25" });
    expect(weeks).toHaveLength(2);
    expect(weeks[0]).toMatchObject({ start: "2026-09-14", clicks: 2, impressions: 40, partial: false });
    expect(weeks[0].position).toBeCloseTo(7);
    expect(weeks[1]).toMatchObject({ start: "2026-09-21", clicks: 5, partial: true });
  });
});

describe("compareTotals", () => {
  it("reports relative change for counts and treats a lower position as better", () => {
    const d = compareTotals(
      { clicks: 120, impressions: 1000, ctr: 0.12, position: 8 },
      { clicks: 100, impressions: 1000, ctr: 0.1, position: 10 },
    );
    expect(d.clicks).toEqual({ value: 0.2, direction: "better" });
    expect(d.impressions).toEqual({ value: 0, direction: "flat" });
    expect(d.ctr.value).toBeCloseTo(0.02);
    expect(d.ctr.direction).toBe("better");
    expect(d.position).toEqual({ value: -2, direction: "better" });
  });

  it("has no delta without a baseline", () => {
    const d = compareTotals(
      { clicks: 5, impressions: 50, ctr: 0.1, position: 3 },
      { clicks: 0, impressions: 0, ctr: null, position: null },
    );
    expect(d.clicks).toEqual({ value: null, direction: null });
    expect(d.position).toEqual({ value: null, direction: null });
  });
});

describe("previousPeriod", () => {
  it("returns the equal-length window just before", () => {
    expect(previousPeriod("2026-09-01", "2026-09-28")).toEqual({ from: "2026-08-04", to: "2026-08-31" });
  });
});

describe("sumBuckets", () => {
  it("sums per week and nulls buckets outside the imported span", () => {
    const out = sumBuckets(
      [
        { date: "2026-09-09", value: 2 },
        { date: "2026-09-10", value: 3 },
        { date: "2026-09-15", value: 1 },
      ],
      { from: "2026-08-31", to: "2026-09-27", granularity: "week", firstDate: "2026-09-09", lastDate: "2026-09-16" },
    );
    expect(out.map((b) => [b.start, b.value])).toEqual([
      ["2026-08-31", null],
      ["2026-09-07", 5],
      ["2026-09-14", 1],
      ["2026-09-21", null],
    ]);
    expect(out.every((b) => !b.partial)).toBe(true);
  });

  it("keeps zero days inside the span as 0", () => {
    const out = sumBuckets([{ date: "2026-09-07", value: 0 }], {
      from: "2026-09-07", to: "2026-09-08", granularity: "day", firstDate: "2026-09-07", lastDate: "2026-09-08",
    });
    expect(out.map((b) => b.value)).toEqual([0, 0]);
  });

  it("is all null when nothing has been imported", () => {
    expect(
      sumBuckets([], { from: "2026-09-07", to: "2026-09-08", granularity: "day", firstDate: null, lastDate: null }).map((b) => b.value),
    ).toEqual([null, null]);
  });
});
