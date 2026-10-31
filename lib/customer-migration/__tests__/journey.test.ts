import { describe, expect, it } from "vitest";
import { JOURNEY_STAGES, migrationJourney, type JourneyStage, type JourneyStageCount } from "@/lib/customer-migration/journey";
import type { MigrationSummary } from "@/lib/customer-migration/overview";
import { barSegments } from "@/app/[lang]/settings/customers/migration-journey";

/** The Migration card's funnel (2026-10-31): the furthest stage of each Migrated customer. */

const here = (counts: Partial<Record<JourneyStage, number | [number, number]>>): Record<JourneyStage, JourneyStageCount> =>
  Object.fromEntries(
    JOURNEY_STAGES.map((s) => {
      const v = counts[s] ?? 0;
      return [s, Array.isArray(v) ? { here: v[0], unreachable: v[1] } : { here: v, unreachable: 0 }];
    }),
  ) as Record<JourneyStage, JourneyStageCount>;

const summary = (over: Partial<MigrationSummary>): MigrationSummary => ({
  imported: 0,
  created: 0,
  matched: 0,
  signedUp: 0,
  signedUpBeforeImport: 0,
  batchesApplied: 1,
  clicked: 0,
  claimBonuses: 0,
  migratedPointsSpent: 0,
  pointsOrders: 0,
  pointsRevenue: 0,
  emailed: 0,
  emailsBounced: 0,
  emailsComplained: 0,
  stages: here({}),
  ...over,
});

describe("migrationJourney", () => {
  const s = summary({
    imported: 1200,
    emailed: 960,
    clicked: 300,
    signedUp: 150,
    claimBonuses: 120,
    stages: here({ imported: [230, 20], emailed: [660, 12], clicked: [160, 1], signed_up: 30, claim_bonus: 95, ordered: 25 }),
  });
  const steps = migrationJourney(s);
  const step = (stage: JourneyStage) => steps.find((x) => x.stage === stage)!;

  it("has the six stages in journey order", () => {
    expect(steps.map((x) => x.label)).toEqual(["Imported", "Emailed", "Clicked", "Signed up", "Claim bonus", "Ordered"]);
  });

  it("reaches a stage at it or further, so the bars only ever step down", () => {
    expect(steps.map((x) => x.reached)).toEqual([1200, 970, 310, 150, 120, 25]);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!.reached).toBeLessThanOrEqual(steps[i - 1]!.reached);
  });

  it("splits each bar into here now and went further, which is the next bar", () => {
    for (let i = 0; i < steps.length; i++) {
      expect(steps[i]!.here + steps[i]!.wentFurther).toBe(steps[i]!.reached);
      expect(steps[i]!.wentFurther).toBe(steps[i + 1]?.reached ?? 0);
    }
    expect(steps.reduce((sum, x) => sum + x.here, 0)).toBe(1200);
  });

  it("gives the shares of everyone imported and of the step before", () => {
    expect(step("imported")).toMatchObject({ ofTotal: "100%", ofPrevious: null, previousLabel: null });
    expect(step("emailed")).toMatchObject({ ofTotal: "81%", ofPrevious: "81%", previousLabel: "imported" });
    expect(step("clicked")).toMatchObject({ ofTotal: "26%", ofPrevious: "32%", previousLabel: "emailed" });
    expect(step("ordered")).toMatchObject({ ofTotal: "2%", ofPrevious: "21%", previousLabel: "claim bonus" });
  });

  it("counts who passed a step without doing it", () => {
    // 970 reached Emailed; 960 were emailed, so 10 signed up or clicked another way.
    expect(step("emailed")).toMatchObject({ skipped: 10, didStep: "960 were emailed" });
    expect(step("clicked")).toMatchObject({ skipped: 10, didStep: "300 opened a Claim link" });
    expect(step("signed_up")).toMatchObject({ skipped: 0, didStep: null });
    expect(step("imported").skipped).toBe(0);
    expect(step("ordered").skipped).toBe(0);
  });

  it("keeps who can't be emailed within who is here", () => {
    expect(step("emailed")).toMatchObject({ here: 660, unreachable: 12 });
    const odd = migrationJourney(summary({ stages: here({ imported: [3, 5] }) }));
    expect(odd[0]!.unreachable).toBe(3);
  });

  it("reads the day of the import: everyone at Imported, one who already had an account", () => {
    const day0 = migrationJourney(summary({ imported: 2158, signedUp: 1, stages: here({ imported: 2157, signed_up: 1 }) }));
    expect(day0.map((x) => x.reached)).toEqual([2158, 1, 1, 1, 0, 0]);
    expect(day0[1]).toMatchObject({ ofTotal: "<1%", skipped: 1, didStep: "0 were emailed" });
    expect(day0[0]).toMatchObject({ here: 2157, wentFurther: 1 });
  });

  it("draws nothing for nobody imported", () => {
    const none = migrationJourney(summary({}));
    expect(none.every((x) => x.reached === 0 && x.total === 0 && x.ofTotal === "0%")).toBe(true);
  });
});

describe("barSegments", () => {
  const total = 100;
  it("puts went further first, then here now, then can't be emailed, then the empty track", () => {
    expect(barSegments({ total, reached: 80, here: 50, unreachable: 10, wentFurther: 30 })).toEqual([
      { kind: "further", from: 0, to: 0.3 },
      { kind: "here", from: 0.3, to: 0.7 },
      { kind: "out", from: 0.7, to: 0.8 },
      { kind: "track", from: 0.8, to: 1 },
    ]);
  });

  it("leaves out the empty parts", () => {
    expect(barSegments({ total, reached: 100, here: 100, unreachable: 0, wentFurther: 0 })).toEqual([
      { kind: "here", from: 0, to: 1 },
    ]);
    expect(barSegments({ total, reached: 0, here: 0, unreachable: 0, wentFurther: 0 })).toEqual([
      { kind: "track", from: 0, to: 1 },
    ]);
    expect(barSegments({ total: 0, reached: 0, here: 0, unreachable: 0, wentFurther: 0 })).toEqual([
      { kind: "track", from: 0, to: 1 },
    ]);
  });

  it("ends went further exactly where the next row's bar ends", () => {
    const steps = migrationJourney(
      summary({ stages: here({ imported: [230, 20], emailed: [660, 12], clicked: 160, signed_up: 30, claim_bonus: 95, ordered: 25 }) }),
    );
    for (let i = 0; i < steps.length - 1; i++) {
      const further = barSegments(steps[i]!).find((x) => x.kind === "further");
      const next = barSegments(steps[i + 1]!).filter((x) => x.kind !== "track").at(-1);
      expect(further?.to).toBeCloseTo(next!.to, 10);
    }
  });
});
