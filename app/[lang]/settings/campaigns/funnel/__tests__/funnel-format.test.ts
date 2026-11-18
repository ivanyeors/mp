import { describe, expect, it, vi } from "vitest";
import { NO_RESULTS } from "@/lib/email-campaigns/results";
import * as results from "@/lib/email-campaigns/results";
import type { FunnelStageView } from "@/lib/email-funnel/model";
import { bandSizes, flowTree, resultCells, segmentChips, stageFromParam } from "../funnel-format";

describe("flowTree with a loop", () => {
  const step = (key: string, campaignId: string, after: string) =>
    ({ key, campaigns: [{ id: campaignId }], after: { campaignId: after, did: "sent" } }) as unknown as FunnelStageView["flow"][number];
  it("keeps every step exactly once, never recursing forever", () => {
    const tree = flowTree([step("a", "c1", "c2"), step("b", "c2", "c1"), step("c", "c3", "c2")]);
    const keys = tree.flatMap((t) => [t.step.key, ...t.followUps.map((f) => f.key)]);
    expect(keys.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("bandSizes", () => {
  it("sizes by Customers, never under the minimum", () => {
    expect(bandSizes([100, 25, 0, null], 0.4)).toEqual([1, 0.5, 0.4, 0.4]);
  });
});

/** The Email funnel page's cells and words (PRD-email-funnel slice 03). */

describe("resultCells", () => {
  it("renders a dash in every cell when nobody was sent, never 0% or NaN", () => {
    const cells = resultCells({ ...NO_RESULTS });
    expect(cells).toEqual({ sent: "—", clicked: "—", unsubscribed: "—", complained: "—", bought: "—", spent: "—" });
    expect(JSON.stringify(cells)).not.toMatch(/NaN|0%/);
  });

  it("gives each count its rate over people sent, through rate()", () => {
    const spy = vi.spyOn(results, "rate");
    const cells = resultCells({ ...NO_RESULTS, people: 200, clicked: 30, unsubscribed: 1, complained: 0, bought: 8, boughtTotal: 2140.4 });
    expect(cells).toEqual({
      sent: "200",
      clicked: "30 (15%)",
      unsubscribed: "1 (0.5%)",
      complained: "0 (0%)",
      bought: "8 (4%)",
      spent: "S$2,140",
    });
    // Over people sent (200), not over clicks or opens.
    expect(spy).toHaveBeenCalledWith(8, 200);
    expect(spy).toHaveBeenCalledWith(30, 200);
    spy.mockRestore();
  });

  it("shows no spend when nobody bought", () => {
    expect(resultCells({ ...NO_RESULTS, people: 5 }).spent).toBe("—");
  });
});

describe("stageFromParam", () => {
  const view = {
    stages: (["lead", "new", "loyal", "at_risk", "lost"] as const).map((stage) => ({ stage, param: stage.replace("_", "-") })),
  } as unknown as { stages: FunnelStageView[] };
  it("reads the hyphenated stage, and falls back to Lead", () => {
    expect(stageFromParam(view, "at-risk")).toBe("at_risk");
    expect(stageFromParam(view, ["lost", "new"])).toBe("lost");
    expect(stageFromParam(view, undefined)).toBe("lead");
    expect(stageFromParam(view, "at_risk")).toBe("lead");
    expect(stageFromParam(view, "visitor")).toBe("lead");
  });
});

describe("segmentChips", () => {
  it("reads the Customers page's chip labels, and never a search's words", () => {
    const names = new Map([["00000000-0000-4000-8000-00000000e001", "November care tips"]]);
    expect(segmentChips({ stage: "at-risk", last_order: "within:24" }, names)).toEqual(["Stage: At risk", "Last order within 2 years"]);
    const chips = segmentChips({ search: "jane@example.test", campaign: "00000000-0000-4000-8000-00000000e001:clicked" }, names);
    expect(chips).toEqual(["Search", "Clicked “November care tips”"]);
    expect(chips.join(" ")).not.toContain("jane");
    expect(segmentChips({ stage: "lead" }, names, true)[0]).toBe("Search");
  });
});

describe("flowTree", () => {
  const step = (key: string, campaignId: string | null, after: string | null) =>
    ({
      key,
      campaigns: campaignId ? [{ id: campaignId }] : [],
      after: after ? { campaignId: after, did: "sent" } : null,
    }) as unknown as FunnelStageView["flow"][number];
  it("hangs a follow-up, and a follow-up of it, under the first campaign", () => {
    const tree = flowTree([step("a", "c1", null), step("b", "c2", "c1"), step("c", "c3", "c2"), step("d", "c4", "gone")]);
    expect(tree.map((t) => [t.step.key, t.followUps.map((f) => f.key)])).toEqual([
      ["a", ["b", "c"]],
      ["d", []],
    ]);
  });
});
