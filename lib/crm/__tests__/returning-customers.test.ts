import { describe, expect, it } from "vitest";
import { MIN_RATE_BASE, returningHeadline, returningSummary, type CohortRow } from "@/lib/crm/returning-customers";

const NOW = new Date("2026-11-01T04:00:00Z");
const row = (cohort_month: string, first_buyers: number, came_back: number, via_readjustment: number, via_purchase: number): CohortRow => ({
  cohort_month,
  first_buyers,
  came_back,
  via_readjustment,
  via_purchase,
});

describe("returningSummary", () => {
  it("writes the PRD's demo headline for the latest closed cohort", () => {
    const s = returningSummary([row("2025-03-01", 100, 31, 22, 14), row("2025-02-01", 80, 20, 10, 12)], NOW);
    expect(returningHeadline(s)).toBe(
      "Of customers who first bought in Mar 2025, 31% came back within 12 months (re-adjustment 22%, second purchase 14%).",
    );
    expect(s.cohorts.map((c) => c.month)).toEqual(["2025-02", "2025-03"]);
  });

  it("marks a cohort still open until its last customer has had 12 months, and shows it no rate", () => {
    const s = returningSummary([row("2025-10-01", 50, 5, 3, 2), row("2025-11-01", 60, 1, 1, 0)], NOW);
    expect(s.cohorts.map((c) => [c.month, c.open, c.closesOn])).toEqual([
      ["2025-10", false, "2026-11-01"],
      ["2025-11", true, "2026-12-01"],
    ]);
    expect(s.cohorts[1]!.rate).toBeNull();
    expect(s.cohorts[0]!.rate).toEqual({ cameBack: 10, viaReadjustment: 6, viaPurchase: 4 });
  });

  it(`shows counts only under ${MIN_RATE_BASE} people`, () => {
    const s = returningSummary([row("2024-05-01", MIN_RATE_BASE - 1, 9, 5, 4), row("2024-06-01", MIN_RATE_BASE, 10, 5, 5)], NOW);
    expect(s.cohorts[0]!.rate).toBeNull();
    expect(s.cohorts[1]!.rate?.cameBack).toBe(50);
    expect(s.headline?.month).toBe("2024-06");
  });

  it("says why there is no rate yet, and when the first full year ends", () => {
    const s = returningSummary([row("2026-06-01", 40, 2, 1, 1), row("2026-07-01", 12, 0, 0, 0)], NOW);
    expect(s.headline).toBeNull();
    expect(returningHeadline(s)).toBe(
      "No month has had its full 12 months with 20 or more first-time customers yet, so the counts show without a rate. The first full year ends on 1 Jul 2027.",
    );
    expect(returningHeadline(returningSummary([], NOW))).toBe("No purchases on this site yet.");
  });
});
