import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { agentTree, companyProblems, readCompany } from "./roster";

function fixture(agents: Record<string, string>, okrs = "---\nokrs: []\n---\n"): string {
  const dir = mkdtempSync(join(tmpdir(), "company-"));
  mkdirSync(join(dir, "agents"));
  for (const [name, text] of Object.entries(agents)) writeFileSync(join(dir, "agents", name), text);
  writeFileSync(join(dir, "okrs.md"), okrs);
  writeFileSync(join(dir, "manual.md"), "# Manual\n");
  return dir;
}

const agent = (fm: string, body = "# A\n\n## Finish\n\nManual section 12.\n") => `---\n${fm}\n---\n\n${body}`;
const TASK = "tasks:\n  - name: t\n    trigger: trig_01abc\n    schedule: CRON_TZ=Asia/Singapore 0 9 * * 1\n    loader: drive";

describe("the company folder", () => {
  const company = readCompany();

  it("is a single tree under Agent 0, with every agent's instructions written", () => {
    expect(companyProblems(company)).toEqual([]);
    const root = agentTree(company.agents);
    expect(root?.id).toBe("ceo");
    const count = (n: NonNullable<typeof root>): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
    expect(count(root!)).toBe(company.agents.length);
  });

  it("gives every live agent a task the page can schedule", () => {
    for (const a of company.agents.filter((x) => x.status === "Live")) {
      expect(a.tasks?.length, a.id).toBeGreaterThan(0);
    }
  });

  it("aligns every agent key result to an OKR that exists", () => {
    const ids = new Set(company.okrs.map((o) => o.id));
    for (const o of company.okrs.filter((x) => x.parent)) expect(ids.has(o.parent!), o.id).toBe(true);
  });
});

describe("companyProblems", () => {
  it("names a missing parent, a department with a task, an unwritten body and an orphan OKR", () => {
    const dir = fixture(
      {
        "ceo.md": agent(`id: ceo\nname: Agent 0\nparent: null\nkind: ceo\nstatus: Live\norder: 0\n${TASK}`),
        "x.md": agent(`id: x\nname: X\nparent: nobody\nkind: agent\nstatus: Live\norder: 1\n${TASK}`),
        "d.md": agent(`id: d\nname: D\nparent: ceo\nkind: dept\nstatus: Group\norder: 2\n${TASK}`),
        "y.md": agent(`id: y\nname: Y\nparent: ceo\nkind: agent\nstatus: Live\norder: 3\n${TASK}`, "BODY_PENDING\n"),
      },
      "---\nokrs:\n  - id: y-1\n    owner: y\n    level: KR\n    text: t\n    parent: KR9.9\n---\n",
    );
    expect(companyProblems(readCompany(dir))).toEqual([
      'x: parent "nobody" is not an agent',
      "d: a department runs no task",
      'y: body has no "## Finish" section',
      "y: body not written",
      'OKR y-1: parent "KR9.9" is not an OKR',
    ]);
  });

  it("refuses a file whose id does not match its name, or an unknown kind", () => {
    expect(() => readCompany(fixture({ "a.md": agent(`id: b\nname: B\nparent: null\nkind: ceo\nstatus: Live\norder: 0\n${TASK}`) }))).toThrow(/has id "b"/);
    expect(() => readCompany(fixture({ "a.md": agent(`id: a\nname: A\nparent: null\nkind: boss\nstatus: Live\norder: 0`) }))).toThrow();
  });
});
