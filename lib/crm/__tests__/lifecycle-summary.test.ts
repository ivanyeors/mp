import { describe, expect, it } from "vitest";
import { lifecycleStageOf, lifecycleSummary, type LifecycleCountRow } from "@/lib/crm/lifecycle-summary";
import { lifecycleBarParts, lifecycleRowSummary } from "@/app/[lang]/settings/customers/lifecycle-card";

const row = (stage: string, detail: string | null, undated: boolean, customers: number | string): LifecycleCountRow => ({
  stage,
  detail,
  undated,
  customers,
});

const ROWS = [
  row("lead", null, false, 500),
  row("new", "awaiting_delivery", false, 20),
  row("new", "delivered", false, 40),
  row("new", "settled", false, 100),
  row("new", null, true, 1000),
  row("loyal", "repeat_purchases", false, 60),
  row("loyal", "repeat_purchases", true, "240"),
  row("loyal", "bookings", false, 10),
  row("at_risk", null, false, 20),
  row("at_risk", "lapsed", false, 5),
  row("lost", null, false, 3),
  row("lost", null, true, 2),
];

describe("lifecycleSummary", () => {
  const s = lifecycleSummary(ROWS);
  const stage = (name: Parameters<typeof lifecycleStageOf>[1]) => lifecycleStageOf(s, name);

  it("has the five stages in funnel order, adding up to every Customer", () => {
    expect(s.stages.map((x) => x.label)).toEqual(["Lead", "New", "Loyal", "At risk", "Lost"]);
    expect(s.stages.map((x) => x.customers)).toEqual([500, 1160, 310, 25, 5]);
    expect(s.total).toBe(2000);
  });

  it("gives each stage's share of every Customer", () => {
    expect(s.stages.map((x) => x.share)).toEqual(["25%", "58%", "16%", "1%", "<1%"]);
  });

  it("splits a stage by its sub-statuses, in the order a Customer moves through them", () => {
    expect(stage("new").parts.map((p) => [p.key, p.customers])).toEqual([
      ["awaiting_delivery", 20],
      ["delivered", 40],
      ["settled", 100],
      ["none", 1000],
    ]);
    expect(stage("loyal").parts.map((p) => [p.key, p.customers, p.undated])).toEqual([
      ["repeat_purchases", 300, 240],
      ["bookings", 10, 0],
    ]);
    expect(stage("at_risk").parts.map((p) => [p.label, p.customers])).toEqual([
      ["12 to 24 months", 20],
      ["Lapsed", 5],
    ]);
  });

  it("counts no dates yet for New and Loyal only: Lost is placed by consent, whatever the dates", () => {
    expect(stage("new").undated).toBe(1000);
    expect(stage("loyal").undated).toBe(240);
    expect(stage("lost")).toMatchObject({ customers: 5, undated: 0 });
  });

  it("folds a sub-status the stage does not have into its own, and leaves out a stage it does not know", () => {
    const odd = lifecycleSummary([row("lead", "settled", false, 4), row("somewhere", null, false, 9), row("loyal", "subscriber", false, 2)]);
    expect(odd.total).toBe(6);
    expect(lifecycleStageOf(odd, "lead").customers).toBe(4);
    expect(lifecycleStageOf(odd, "loyal").parts.map((p) => p.customers)).toEqual([0, 2]);
  });

  it("reads nothing as no Customers", () => {
    const none = lifecycleSummary([]);
    expect(none.total).toBe(0);
    expect(none.stages.every((x) => x.customers === 0 && x.share === "0%")).toBe(true);
  });
});

describe("lifecycleBarParts", () => {
  const s = lifecycleSummary(ROWS);

  it("draws each sub-status dated first, then hatched for no dates yet, then the empty track", () => {
    expect(lifecycleBarParts(lifecycleStageOf(s, "loyal"), 1000)).toEqual([
      { key: "repeat_purchases", shade: 3, hatched: false, from: 0, to: 0.06 },
      { key: "repeat_purchases", shade: 3, hatched: true, from: 0.06, to: 0.3 },
      { key: "bookings", shade: 1, hatched: false, from: 0.3, to: 0.31 },
      { key: "track", shade: 1, hatched: false, from: 0.31, to: 1 },
    ]);
  });

  it("hatches New's Customers with no dates yet, who have no delivery to show", () => {
    const parts = lifecycleBarParts(lifecycleStageOf(s, "new"), s.total);
    expect(parts.map((p) => [p.key, p.hatched])).toEqual([
      ["awaiting_delivery", false],
      ["delivered", false],
      ["settled", false],
      ["none", true],
      ["track", false],
    ]);
  });

  it("leaves out empty parts, and draws only the track for nobody", () => {
    expect(lifecycleBarParts(lifecycleSummary([]).stages[0]!, 0)).toEqual([{ key: "track", shade: 1, hatched: false, from: 0, to: 1 }]);
    const lost = lifecycleBarParts(lifecycleStageOf(s, "lost"), s.total);
    expect(lost.map((p) => p.key)).toEqual(["none", "track"]);
  });
});

describe("lifecycleRowSummary", () => {
  const s = lifecycleSummary(ROWS);
  it("says the stage, its share and its sub-statuses in one sentence", () => {
    expect(lifecycleRowSummary(lifecycleStageOf(s, "loyal"))).toBe(
      "Loyal: 310 customers, 16% of all. Repeat purchases 300, Bookings 10. 240 with no dates yet.",
    );
    expect(lifecycleRowSummary(lifecycleStageOf(s, "lead"))).toBe("Lead: 500 customers, 25% of all.");
  });
});
