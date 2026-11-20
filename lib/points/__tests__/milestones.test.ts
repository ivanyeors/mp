import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEEDED_MILESTONES, formatMilestones, milestoneCostRows, milestoneProgress, parseMilestones } from "../milestones";

type Case = { name: string; value: string | null; expected: [number, number][] };
const CASES = JSON.parse(
  readFileSync(join(process.cwd(), "supabase/tests/loyalty-points/milestone-cases.json"), "utf8"),
) as { cases: Case[] };
const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261023120000_points_milestones.sql"), "utf8");

describe("parseMilestones: milestone-cases.json (the same table points_milestones() answers)", () => {
  it.each(CASES.cases.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    expect(parseMilestones(c.value).map((m) => [m.at, m.bonus])).toEqual(c.expected);
  });
});

describe("the setting", () => {
  it("is seeded in SQL as SEEDED_MILESTONES, and reads back as it", () => {
    expect(MIGRATION).toContain(`('points_milestones', '${formatMilestones(SEEDED_MILESTONES)}')`);
    expect(parseMilestones(formatMilestones(SEEDED_MILESTONES))).toEqual(SEEDED_MILESTONES);
  });

  it("writes none as blank, and lowest first", () => {
    expect(formatMilestones([])).toBe("");
    expect(formatMilestones([{ at: 2500, bonus: 300 }, { at: 1000, bonus: 100 }])).toBe("1000:100,2500:300");
  });
});

describe("milestoneProgress", () => {
  const ladder = [...SEEDED_MILESTONES];

  it("starts empty, with the first milestone next", () => {
    const p = milestoneProgress(ladder, 0);
    expect(p.steps.map((s) => s.fill)).toEqual([0, 0, 0, 0]);
    expect(p.next).toEqual({ milestone: 1, at: 1000, bonus: 100, toGo: 1000 });
  });

  it("fills each milestone's own stretch, and shows pending points on top", () => {
    const p = milestoneProgress(ladder, 1750, 500);
    expect(p.steps.map((s) => s.reached)).toEqual([true, false, false, false]);
    expect(p.steps[1]).toMatchObject({ fill: 0.5, pendingFill: 1250 / 1500 });
    expect(p.steps[0]).toMatchObject({ fill: 1, pendingFill: 1 });
    expect(p.steps[2]).toMatchObject({ fill: 0, pendingFill: 0 });
    expect(p.next).toEqual({ milestone: 2, at: 2500, bonus: 300, toGo: 750 });
  });

  it("reaches a milestone at exactly its points, and has nothing next past the last", () => {
    expect(milestoneProgress(ladder, 1000).steps[0]!.reached).toBe(true);
    expect(milestoneProgress(ladder, 12000).next).toBeNull();
    expect(milestoneProgress(ladder, 12000).steps.every((s) => s.fill === 1)).toBe(true);
  });

  it("is nothing without a ladder, and never below zero", () => {
    expect(milestoneProgress([], 5000)).toEqual({ earned: 5000, pending: 0, steps: [], next: null });
    expect(milestoneProgress(ladder, -40, -5)).toMatchObject({ earned: 0, pending: 0 });
  });
});

describe("milestoneCostRows", () => {
  it("states the spend that reaches each milestone and what the customer then has back", () => {
    const rows = milestoneCostRows(SEEDED_MILESTONES, 3);
    expect(rows.map((r) => r.spend)).toEqual([334, 834, 1667, 3334]);
    expect(rows.map((r) => r.bonusesSoFar)).toEqual([100, 400, 1200, 3200]);
    expect(rows[3]!.backShare).toBeCloseTo(132 / 3334, 6);
  });

  it("has no spend at a rate of 0", () => {
    expect(milestoneCostRows(SEEDED_MILESTONES, 0)[0]).toMatchObject({ spend: null, backShare: null });
  });
});
