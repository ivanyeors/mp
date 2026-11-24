import { describe, expect, it } from "vitest";
import type { OutputFile } from "./drive";
import { beatsOf, buildOverview, copyStates, okrTree, outputsOf } from "./overview";
import { parseReport } from "./report";
import type { Agent, Company } from "./roster";

const now = new Date("2026-11-24T08:00:00Z");
const task = (schedule: string) => [{ name: "t", trigger: "trig_x", schedule, loader: "drive" as const }];
const agent = (a: Partial<Agent> & Pick<Agent, "id">): Agent => ({
  name: a.id, parent: "ceo", kind: "agent", status: "Live", order: 1, body: "", file: { path: `agents/${a.id}.md`, md5: `md5-${a.id}` }, ...a,
});
const file = (name: string, folder = "2026/2026-11", extra: Partial<OutputFile> = {}): OutputFile => ({
  id: name, name, mimeType: "text/markdown", modifiedTime: "2026-11-24T01:00:00Z", webViewLink: null, md5: null, folder, ...extra,
});

const company: Company = {
  agents: [
    agent({ id: "ceo", parent: null, kind: "ceo", order: 0, tasks: task("CRON_TZ=Asia/Singapore 39 8 8 * *") }),
    agent({ id: "dept-sales", kind: "dept", status: "Group" }),
    agent({ id: "crm", parent: "dept-sales", tasks: task("CRON_TZ=Asia/Singapore 47 8 * * 2") }),
    agent({ id: "ops", tasks: task("CRON_TZ=Asia/Singapore 27 8 * * 1") }),
    agent({ id: "social", status: "Paused", tasks: task("CRON_TZ=Asia/Singapore 46 8 1 * *") }),
  ],
  okrs: [
    { id: "O6", owner: "company", level: "Objective", text: "Deliver well" },
    { id: "KR6.1", owner: "company", level: "KR", text: "Order-to-door time", parent: "O6" },
    { id: "crm-1", owner: "crm", level: "KR", text: "Follow-ups", parent: "KR6.1" },
  ],
  manual: "",
  files: [{ path: "manual.md", md5: "m1" }, { path: "agents/crm.md", md5: "c1" }, { path: "okrs.md", md5: "o1" }],
};

const report = (status: string, extra = "") => parseReport(`# R\n\nStatus: ${status}\n\nHeadline: h\n\n${extra}`);

describe("buildOverview", () => {
  const files = [
    file("2026-11-24_crm_weekly.md"),
    file("2026-11-17_crm_weekly.md"),
    file("2026-11-24_crm_draft_templates.md"),
    file("2026-11-16_ops_weekly"),
    file("bd_pipeline.csv", "_trackers"),
  ];
  const reports = new Map([
    ["2026-11-24_crm_weekly.md", report("Degraded", "## Decisions for Ivan\n\n- crm-2026-11-1: Later? | Decide by: 30 Nov 2026\n- crm-2026-11-2: Late? | Decide by: 20 Nov 2026\n- crm-2026-11-3: Whenever?\n\n## OKR progress\n\n| KR id | Key result | Current | Target | Status |\n|---|---|---|---|---|\n| crm-1 | Follow-ups | 0% | 100% | Off track |\n\n## Alerts\n\n- medium — later — deadline: none\n- critical — first — deadline: 25 Nov 2026\n")],
    ["2026-11-16_ops_weekly", report("OK", "## OKR progress\n\n| KR id | Key result | Current | Target | Status |\n|---|---|---|---|---|\n| crm-1 | Follow-ups | 5% | 100% | At risk |\n")],
  ]);
  const o = buildOverview(company, files, reports, now);
  const byId = Object.fromEntries(o.agents.map((a) => [a.agent.id, a]));

  it("takes each agent's newest report, not a draft or an older one", () => {
    expect(byId.crm.latest?.file.name).toBe("2026-11-24_crm_weekly.md");
    expect(byId.crm.outputs.map((x) => x.file.name)).toEqual(["2026-11-24_crm_draft_templates.md", "2026-11-24_crm_weekly.md", "2026-11-17_crm_weekly.md"]);
  });

  it("marks an agent that filed nothing since its last scheduled run as missed", () => {
    expect(byId.crm.health).toBe("degraded");
    expect(byId.ops.health).toBe("missed");
    expect(byId.social.health).toBe("paused");
    expect(byId["dept-sales"].health).toBe("group");
    expect(byId.ceo.health).toBe("none");
    expect(byId.social.nextRun).toBeNull();
    expect(byId.crm.nextRun).toBe("2026-12-01T00:47:00.000Z");
  });

  it("puts overdue decisions first, then by decide-by date, undated last", () => {
    expect(o.decisions.map((d) => [d.id, d.overdue])).toEqual([["crm-2026-11-2", true], ["crm-2026-11-1", false], ["crm-2026-11-3", false]]);
    expect(o.alerts.map((a) => a.text)).toEqual(["first", "later"]);
    expect(o.stats).toMatchObject({ live: 3, total: 4, decisions: 3, overdue: 1, urgentAlerts: 1 });
  });

  it("keeps the newest reported value of each key result", () => {
    expect(o.okrValues["crm-1"]).toEqual({ current: "0%", status: "Off track", agent: "crm", date: "2026-11-24" });
  });
});

describe("helpers", () => {
  it("ignores files outside the month folders and names that do not follow the pattern", () => {
    expect(outputsOf([file("random notes"), file("2026-11-24_crm_weekly.md", "_trackers"), file("2026-11-24_crm_weekly.md")])).toHaveLength(1);
  });

  it("compares each repository file with its Drive copy", () => {
    const drive = [file("manual.md", "_company", { md5: "m1" }), file("crm.md", "_company/agents", { md5: "stale" })];
    expect(copyStates(company.files, drive)).toEqual([
      { path: "manual.md", state: "same" },
      { path: "agents/crm.md", state: "differs" },
      { path: "okrs.md", state: "missing" },
    ]);
  });

  it("hangs agent key results under the company key result they support", () => {
    expect(okrTree(company.okrs)).toEqual([
      { okr: company.okrs[0], krs: [{ ...company.okrs[1], aligned: [company.okrs[2]] }] },
    ]);
  });
});

describe("beatsOf", () => {
  const weekly = "CRON_TZ=Asia/Singapore 47 8 * * 2";
  const out = (date: string) => ({ file: file(`${date}_crm_weekly.md`), name: { date, agent: "crm", kind: "weekly" as const, slug: null, ext: "md" as const } });

  it("marks each scheduled run as filed, missed, or before the agent's first report", () => {
    const beats = beatsOf(weekly, [out("2026-11-10"), out("2026-11-24")], (o) => (o.name.date === "2026-11-24" ? "degraded" : "ok"), now, 4);
    expect(beats.map((b) => [b.due.slice(0, 10), b.state, b.tone])).toEqual([
      ["2026-11-03", "before", null],
      ["2026-11-10", "filed", "ok"],
      ["2026-11-17", "missed", null],
      ["2026-11-24", "filed", "degraded"],
    ]);
  });

  it("does not call a run missed while it may still be running", () => {
    const justDue = new Date("2026-11-24T01:00:00Z");
    expect(beatsOf(weekly, [out("2026-11-17")], () => "ok", justDue, 2).map((b) => b.state)).toEqual(["filed", "before"]);
  });
});

