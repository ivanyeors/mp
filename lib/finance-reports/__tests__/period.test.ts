import { describe, expect, it } from "vitest";
import {
  isWholeMonth,
  monthPeriod,
  parseReportPeriod,
  periodLabel,
  periodSlug,
  previousMonth,
  sgtDate,
  sgtTime,
} from "../period";

describe("report periods (Singapore time)", () => {
  it("resolves a period to SGT midnights", () => {
    const r = parseReportPeriod("2026-10-01", "2026-10-31");
    expect(r).toEqual({
      ok: true,
      period: {
        from: "2026-10-01",
        to: "2026-10-31",
        fromIso: "2026-09-30T16:00:00.000Z",
        toExclusiveIso: "2026-10-31T16:00:00.000Z",
      },
    });
  });

  it("refuses bad dates, reversed ranges and ranges over a year", () => {
    expect(parseReportPeriod("2026-02-30", "2026-03-01").ok).toBe(false);
    expect(parseReportPeriod("2026-10", "2026-10-31").ok).toBe(false);
    expect(parseReportPeriod("2026-10-31", "2026-10-01").ok).toBe(false);
    expect(parseReportPeriod("2025-01-01", "2026-06-30").ok).toBe(false);
    expect(parseReportPeriod("2028-01-01", "2028-12-31").ok).toBe(true);
  });

  it("dates an instant on the Singapore calendar", () => {
    // 23:30 UTC on the 31st is 07:30 on the 1st in Singapore.
    expect(sgtDate("2026-10-31T23:30:00.000Z")).toBe("2026-11-01");
    expect(sgtTime("2026-10-31T23:30:00.000Z")).toBe("07:30");
  });

  it("finds the previous whole month in Singapore", () => {
    expect(previousMonth(new Date("2026-10-22T03:00:00.000Z"))).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(previousMonth(new Date("2026-01-05T03:00:00.000Z"))).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    // 20:00 UTC on 31 Oct is already 1 Nov in Singapore.
    expect(previousMonth(new Date("2026-10-31T20:00:00.000Z"))).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("labels whole months and other ranges", () => {
    expect(monthPeriod(2028, 2)).toEqual({ from: "2028-02-01", to: "2028-02-29" });
    expect(isWholeMonth({ from: "2026-10-01", to: "2026-10-31" })).toBe(true);
    expect(isWholeMonth({ from: "2026-10-01", to: "2026-10-30" })).toBe(false);
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-31" })).toBe("October 2026");
    expect(periodLabel({ from: "2026-10-01", to: "2026-10-15" })).toBe("1 Oct 2026 – 15 Oct 2026");
    expect(periodSlug({ from: "2026-10-01", to: "2026-10-31" })).toBe("2026-10");
    expect(periodSlug({ from: "2026-10-01", to: "2026-10-15" })).toBe("2026-10-01_2026-10-15");
  });
});
