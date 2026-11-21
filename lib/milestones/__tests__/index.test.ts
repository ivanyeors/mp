import { describe, it, expect } from "vitest";
import {
  currentTierFor,
  ratchetTier,
  nextRungFor,
  unitsToNext,
  cumulativeRateBump,
  progressToNext,
  topPercentBucket,
  milestoneState,
  perksUpTo,
  ENDOWED_UNITS,
  ENDOWED_REASON,
  type MilestoneRung,
} from "@/lib/milestones";

const rungs: MilestoneRung[] = [
  { tier: 2, units_threshold: 15, cash_bonus: 100, rate_bump: 1, perk_label: "demo set" },
  { tier: 1, units_threshold: 5, cash_bonus: 50, rate_bump: 0.5, perk_label: "fitter listing" },
  { tier: 4, units_threshold: 100, cash_bonus: 500, rate_bump: 3, perk_label: "recognition" },
  { tier: 3, units_threshold: 40, cash_bonus: 250, rate_bump: 2, perk_label: "co-marketing" },
];

describe("currentTierFor — rung DETECTION at exact boundaries", () => {
  it("below the first rung → tier 0", () => {
    expect(currentTierFor(0, rungs)).toBe(0);
    expect(currentTierFor(4, rungs)).toBe(0);
  });
  it("units == threshold crosses the rung", () => {
    expect(currentTierFor(5, rungs)).toBe(1);
    expect(currentTierFor(15, rungs)).toBe(2);
    expect(currentTierFor(40, rungs)).toBe(3);
    expect(currentTierFor(100, rungs)).toBe(4);
  });
  it("units == threshold − 1 does NOT cross", () => {
    expect(currentTierFor(14, rungs)).toBe(1);
    expect(currentTierFor(39, rungs)).toBe(2);
    expect(currentTierFor(99, rungs)).toBe(3);
  });
  it("beyond the top rung stays at the top tier", () => {
    expect(currentTierFor(10_000, rungs)).toBe(4);
  });
});

describe("ratchetTier — tiers ratchet up, never demote (ADR 0015 §4)", () => {
  it("keeps the stored max when the computed tier is lower", () => {
    expect(ratchetTier(3, 1)).toBe(3);
  });
  it("climbs when the computed tier is higher", () => {
    expect(ratchetTier(1, 3)).toBe(3);
  });
  it("equal → unchanged", () => {
    expect(ratchetTier(2, 2)).toBe(2);
  });
});

describe("endowed head start (launch partner bonus)", () => {
  it("credits 2 units with the stated reason", () => {
    expect(ENDOWED_UNITS).toBe(2);
    expect(ENDOWED_REASON).toBe("launch partner bonus");
  });
  it("milestoneState surfaces the endowment and does NOT hand out a free tier", () => {
    const s = milestoneState(ENDOWED_UNITS, rungs, 0);
    expect(s.endowedUnits).toBe(2);
    expect(s.endowedReason).toBe("launch partner bonus");
    expect(s.currentTier).toBe(0);
    expect(s.unitsToNext).toBe(3);
  });
});

describe("void decrement across a rung — the tier must NOT demote (ratchet)", () => {
  it("units fall below a crossed rung but stored max holds the tier", () => {
    expect(currentTierFor(14, rungs)).toBe(1);
    const s = milestoneState(14, rungs, 2);
    expect(s.currentTier).toBe(2);
    expect(s.cumulativeRateBump).toBe(1.5);
    expect(s.perks).toEqual(["fitter listing", "demo set"]);
  });
});

describe("nextRungFor / unitsToNext / progressToNext — goal gradient", () => {
  it("nextRungFor returns the next rung above current units, null at the top", () => {
    expect(nextRungFor(7, rungs)?.tier).toBe(2);
    expect(nextRungFor(100, rungs)).toBeNull();
    expect(nextRungFor(250, rungs)).toBeNull();
  });
  it("unitsToNext = whole units to the next rung, 0 at the top", () => {
    expect(unitsToNext(7, rungs)).toBe(8);
    expect(unitsToNext(5, rungs)).toBe(10);
    expect(unitsToNext(100, rungs)).toBe(0);
  });
  it("progressToNext fills 0..100 within the current band, 100 at the top", () => {
    expect(progressToNext(10, rungs, 1)).toBe(50);
    expect(progressToNext(5, rungs, 1)).toBe(0);
    expect(progressToNext(100, rungs, 4)).toBe(100);
  });
});

describe("cumulativeRateBump / perksUpTo — permanent, additive across achieved tiers", () => {
  it("sums rate_bump (percentage points) for every tier ≤ the achieved tier", () => {
    expect(cumulativeRateBump(0, rungs)).toBe(0);
    expect(cumulativeRateBump(1, rungs)).toBe(0.5);
    expect(cumulativeRateBump(2, rungs)).toBe(1.5);
    expect(cumulativeRateBump(4, rungs)).toBe(6.5);
  });
  it("perksUpTo lists perks in ladder order up to the tier", () => {
    expect(perksUpTo(2, rungs)).toEqual(["fitter listing", "demo set"]);
  });
});

describe("topPercentBucket — smallest top-N% chip, no leaderboard", () => {
  const dist = (total: number, greater: number) => [
    ...Array(greater).fill(100),
    ...Array(total - greater).fill(1),
  ];
  const UNITS = 1;

  it("too few partners (< 3) → null", () => {
    expect(topPercentBucket(1, [1])).toBeNull();
    expect(topPercentBucket(1, [1, 1])).toBeNull();
  });

  it("bottom half → null (no bragging chip)", () => {
    expect(topPercentBucket(UNITS, dist(100, 50))).toBeNull();
  });

  it("picks the SMALLEST bucket the partner fits", () => {
    expect(topPercentBucket(UNITS, dist(100, 0))).toBe(1);
    expect(topPercentBucket(UNITS, dist(100, 4))).toBe(5);
    expect(topPercentBucket(UNITS, dist(100, 9))).toBe(10);
    expect(topPercentBucket(UNITS, dist(100, 24))).toBe(25);
    expect(topPercentBucket(UNITS, dist(100, 49))).toBe(50);
  });
});
