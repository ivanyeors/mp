import { describe, expect, it, vi } from "vitest";
import { NO_RESULTS } from "@/lib/email-campaigns/results";
import * as results from "@/lib/email-campaigns/results";
import type { FunnelStageView } from "@/lib/email-funnel/model";
import { bandSizes, flowLayout, flowZones, menuMoves, movePlaces, nodesOf, resultCells, segmentChips, stageFromParam, zoneMove, zoneWords, type FlowNode } from "../funnel-format";

const step = (key: string, campaignId: string, after: string | null, lock: string | null = null) =>
  ({
    key,
    kind: "campaign",
    campaigns: [{ id: campaignId, name: campaignId.toUpperCase(), lock }],
    after: after ? { campaignId: after, did: "sent" } : null,
  }) as unknown as FunnelStageView["flow"][number];
const ids = (layout: ReturnType<typeof flowLayout>) =>
  layout.items.flatMap((i) => (i.kind === "sequence" ? nodesOf(i.root).map((n) => n.campaign.id) : []));

describe("flowLayout with a loop", () => {
  it("keeps every email exactly once, never recursing forever", () => {
    const layout = flowLayout({ flow: [step("a", "c1", "c2"), step("b", "c2", "c1"), step("c", "c3", "c2")] });
    expect(ids(layout).sort()).toEqual(["c1", "c2", "c3"]);
  });
});

describe("bandSizes", () => {
  it("sizes by Customers, never under the minimum", () => {
    expect(bandSizes([100, 25, 0, null], 0.4)).toEqual([1, 0.5, 0.4, 0.4]);
  });
});

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

describe("flowLayout", () => {
  it("runs a chain down one column, numbered, and starts a sequence for an email whose parent is gone", () => {
    const layout = flowLayout({ flow: [step("a", "c1", null), step("b", "c2", "c1"), step("c", "c3", "c2"), step("d", "c4", "gone")] });
    const seqs = layout.items.map((i) => (i.kind === "sequence" ? nodesOf(i.root).map((n) => [n.campaign.id, n.number]) : []));
    expect(seqs).toEqual([
      [
        ["c1", 1],
        ["c2", 2],
        ["c3", 3],
      ],
      [["c4", 1]],
    ]);
  });

  it("lays an optimistic move over the view", () => {
    const layout = flowLayout({ flow: [step("a", "c1", null), step("b", "c2", "c1"), step("c", "c3", "c2")] }, [], new Map([["c3", { id: "c1", did: "sent" as const }], ["c2", { id: "c3", did: "sent" as const }]]));
    expect(ids(layout)).toEqual(["c1", "c3", "c2"]);
  });

  it("lists every drop zone once: each connector, a branch's end, and Start a new sequence; Move to… offers the ones that would change something", () => {
    const branched = { ...step("c", "c3", "c1"), after: { campaignId: "c1", did: "clicked" as const } };
    const layout = flowLayout({ flow: [step("a", "c1", null), step("b", "c2", "c1"), branched, step("d", "c4", null)] });
    const zones = flowZones(layout).map((z) => `${z.from?.campaign.id ?? "start"}→${z.to?.campaign.id ?? "end"}`);
    expect(zones).toEqual(["c1→c2", "c1→c3", "c1→end", "c2→end", "c3→end", "c4→end", "start→end"]);
    const places = movePlaces(layout, "c4", () => true, (id) => id.toUpperCase()).map((p) => p.words);
    expect(places).toEqual([
      "After “C1”, to those who got it, then “C2”",
      "After “C1”, to those who clicked it, then “C3”",
      "After “C1”, to those who got it",
      "After “C2”, to those who got it",
      "After “C3”, to those who got it",
      "After “C4”, to those who got it",
      "Start a new sequence with it",
    ]);
  });

  it("gives Move earlier and Move later the same input as the drop zones they match", () => {
    const layout = flowLayout({ flow: [step("a", "c1", null), step("b", "c2", "c1"), step("c", "c3", "c2")] });
    const [n1, n2, n3] = nodesOf((layout.items[0] as { root: FlowNode }).root);
    expect(menuMoves(layout, "c3").earlier).toEqual(zoneMove("c3", n1, n2));
    expect(menuMoves(layout, "c1").later).toEqual(zoneMove("c1", n2, n3));
    expect(menuMoves(layout, "c2").earlier).toEqual({ campaignId: "c2", after: null, before: "c1" });
    expect(menuMoves(layout, "c3").later).toBeNull();
    expect(zoneWords(zoneMove("c3", n1, n2), (id) => id.toUpperCase())).toBe("After “C1”, to those who got it, then “C2”");
    const locked = flowLayout({ flow: [step("a", "c1", null), step("b", "c2", "c1", "Started.")] });
    const [m1, m2] = nodesOf((locked.items[0] as { root: FlowNode }).root);
    expect(zoneMove("x", m1, m2)).toEqual({ campaignId: "x", after: { campaignId: "c1", did: "sent" }, before: null });
  });
});
