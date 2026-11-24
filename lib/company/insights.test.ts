import { describe, expect, it } from "vitest";
import type { OutputFile } from "./drive";
import { fleetRatios, networkLayout, outcomeCounts, reportsByTeam, runLanes, teamsOf } from "./insights";
import type { AgentView, Beat, Output } from "./overview";
import { parseOutputName } from "./report";
import { agentTree, type Agent } from "./roster";

const now = new Date("2026-11-24T08:00:00Z");
const agent = (a: Partial<Agent> & Pick<Agent, "id">): Agent => ({
  name: a.id.toUpperCase(), parent: "ceo", kind: "agent", status: "Live", order: 1, body: "", file: { path: `agents/${a.id}.md`, md5: a.id }, ...a,
});
const agents = [
  agent({ id: "ceo", parent: null, kind: "ceo", order: 0 }),
  agent({ id: "dept-sales", kind: "dept", status: "Group", order: 1 }),
  agent({ id: "crm", parent: "dept-sales", order: 2 }),
  agent({ id: "bd", parent: "dept-sales", order: 3 }),
  agent({ id: "mkt", name: "Marketing Lead", kind: "lead", order: 4 }),
  agent({ id: "seo", parent: "mkt", order: 5 }),
  agent({ id: "social", parent: "mkt", status: "Paused", order: 6 }),
];
const root = agentTree(agents)!;

const output = (name: string): Output => {
  const file: OutputFile = { id: name, name, mimeType: "text/markdown", modifiedTime: "2026-11-24T01:00:00Z", webViewLink: null, md5: null, folder: "2026/2026-11" };
  return { file, name: parseOutputName(name)! };
};
const beat = (due: string, state: Beat["state"], tone: Beat["tone"] = null): Beat => ({ due, state, tone });
const view = (id: string, outputs: Output[] = [], beats: Beat[] = []): AgentView => ({
  agent: agents.find((a) => a.id === id)!, nextRun: null, lastDue: null, latest: null, outputs, health: "ok", beats,
});

describe("teamsOf", () => {
  it("puts every agent in the team directly under Agent 0, however deep it sits", () => {
    const { teams, teamOf } = teamsOf(root);
    expect(teams).toEqual([{ id: "dept-sales", name: "DEPT-SALES" }, { id: "mkt", name: "Marketing" }]);
    expect(teamOf.get("crm")).toBe("dept-sales");
    expect(teamOf.get("social")).toBe("mkt");
    expect(teamOf.get("mkt")).toBe("mkt");
    expect(teamOf.get("ceo")).toBe("ceo");
  });
});

describe("reportsByTeam", () => {
  const { teamOf } = teamsOf(root);
  const days = reportsByTeam(
    [
      view("crm", [output("2026-11-24_crm_weekly.md"), output("2026-11-24_crm_draft_x.md"), output("2026-10-01_crm_weekly.md")]),
      view("bd", [output("2026-11-24_bd_weekly.md")]),
      view("seo", [output("2026-11-20_seo_monthly.md")]),
    ],
    teamOf,
    now,
  );

  it("counts reports per Singapore day and team, leaving out drafts and days before the window", () => {
    expect(days).toHaveLength(30);
    expect(days.at(-1)).toEqual({ date: "2026-11-24", total: 2, byTeam: { "dept-sales": 2 } });
    expect(days.find((d) => d.date === "2026-11-20")?.byTeam).toEqual({ mkt: 1 });
    expect(days[0].date).toBe("2026-10-26");
    expect(days.reduce((s, d) => s + d.total, 0)).toBe(3);
  });
});

describe("runs in the window", () => {
  const beats = [
    beat("2026-09-01T00:30:00Z", "filed", "failed"),
    beat("2026-11-03T00:30:00Z", "missed"),
    beat("2026-11-10T00:30:00Z", "filed", "degraded"),
    beat("2026-11-17T00:30:00Z", "filed", null),
    beat("2026-11-24T00:30:00Z", "filed", "ok"),
    beat("2026-11-24T09:30:00Z", "before"),
  ];
  const views = [view("dept-sales"), view("crm", [], beats)];

  it("counts outcomes only for runs due inside the window, and never a run not due yet", () => {
    expect(outcomeCounts(views, now)).toEqual({ ok: 1, unchanged: 0, filed: 1, degraded: 1, failed: 0, missed: 1 });
  });

  it("places each run on its lane by how far into the window it was due", () => {
    const [lane] = runLanes(views, teamsOf(root).teamOf, now);
    expect(lane.id).toBe("crm");
    expect(lane.team).toBe("dept-sales");
    expect(lane.marks.map((m) => m.outcome)).toEqual(["missed", "degraded", "filed", "ok"]);
    expect(lane.marks[3].at).toBeCloseTo(1 - 7.5 / (56 * 24), 5);
    expect(lane.marks.every((m) => m.at > 0 && m.at <= 1)).toBe(true);
  });

  it("works out the fleet bars from runners only", () => {
    const ratios = fleetRatios(
      [...views, view("social")],
      [{ path: "manual.md", state: "same" }, { path: "agents/crm.md", state: "differs" }],
      [
        { id: "O1", owner: "company", level: "Objective", text: "o" },
        { id: "KR1.1", owner: "company", level: "KR", text: "k", parent: "O1" },
        { id: "KR1.2", owner: "company", level: "KR", text: "k", parent: "O1" },
        { id: "crm-1", owner: "crm", level: "KR", text: "k", parent: "KR1.1" },
      ],
      { "KR1.1": { current: "3", status: "On track", agent: "crm", date: "2026-11-24" }, "crm-1": { current: "1", status: "", agent: "crm", date: "2026-11-24" } },
    );
    expect(Object.fromEntries(ratios.map((r) => [r.label, [r.done, r.of]]))).toEqual({
      "Agents live": [1, 2],
      "Instructions in sync": [1, 2],
      "Runs filed on time": [4, 5],
      "Reports clean": [2, 4],
      "Key results reported": [1, 2],
    });
    expect(fleetRatios(views, null, [], {}).map((r) => r.label)).not.toContain("Instructions in sync");
  });
});

describe("networkLayout", () => {
  const { nodes, edges } = networkLayout(root);

  it("draws Agent 0 in the middle, teams on the inner ring and their agents on the outer ring", () => {
    expect(nodes.map((n) => [n.id, n.ring])).toEqual([
      ["ceo", 0], ["dept-sales", 1], ["crm", 2], ["bd", 2], ["mkt", 1], ["seo", 2], ["social", 2],
    ]);
    const r = (id: string) => Math.hypot(nodes.find((n) => n.id === id)!.x, nodes.find((n) => n.id === id)!.y);
    expect(r("ceo")).toBe(0);
    expect(r("mkt")).toBeCloseTo(0.52, 2);
    expect(r("seo")).toBeCloseTo(0.9, 2);
  });

  it("starts the first team at the top and links every node to its parent", () => {
    const sales = nodes.find((n) => n.id === "dept-sales")!;
    expect(sales.x).toBeCloseTo(0, 2);
    expect(sales.y).toBeCloseTo(-0.52, 2);
    expect(edges).toContainEqual({ from: "mkt", to: "seo" });
    expect(edges).toContainEqual({ from: "ceo", to: "mkt" });
    expect(edges).toHaveLength(nodes.length - 1);
  });
});
