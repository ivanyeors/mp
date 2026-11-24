import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

export const COMPANY_DIR = join(process.cwd(), "company");

const TaskSchema = z.object({
  name: z.string().min(1),
  trigger: z.string().regex(/^trig_[A-Za-z0-9]+$/),
  schedule: z.string().min(1),
  loader: z.enum(["drive", "inline"]),
});

const AgentSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  name: z.string().min(1),
  parent: z.string().nullable(),
  kind: z.enum(["ceo", "dept", "lead", "agent"]),
  status: z.enum(["Live", "Paused", "Proposed", "Group"]),
  order: z.number(),
  cadence: z.string().optional(),
  tasks: z.array(TaskSchema).optional(),
  mission: z.string().optional(),
  framework: z.string().optional(),
  framework_how: z.string().optional(),
  framework_rule: z.string().optional(),
  sources: z.string().optional(),
  approvals: z.string().optional(),
  link: z.string().url().optional(),
});

const OkrSchema = z.object({
  id: z.string().min(1),
  owner: z.string().min(1),
  level: z.enum(["Objective", "KR"]),
  text: z.string().min(1),
  parent: z.string().optional(),
  baseline: z.string().optional(),
  target: z.string().optional(),
});

export type AgentTask = z.infer<typeof TaskSchema>;
export type Okr = z.infer<typeof OkrSchema>;
export type CompanyFile = { path: string; md5: string };
export type Agent = z.infer<typeof AgentSchema> & { body: string; file: CompanyFile };
export type Company = { agents: Agent[]; okrs: Okr[]; manual: string; files: CompanyFile[] };

const md5 = (text: string) => createHash("md5").update(text).digest("hex");

function read(dir: string, path: string): { text: string; file: CompanyFile } {
  const text = readFileSync(join(dir, path), "utf8");
  return { text, file: { path, md5: md5(text) } };
}

export function readCompany(dir: string = COMPANY_DIR): Company {
  const files: CompanyFile[] = [];
  const agents = readdirSync(join(dir, "agents"))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => {
      const { text, file } = read(dir, `agents/${name}`);
      files.push(file);
      const parsed = matter(text);
      const data = AgentSchema.parse(parsed.data);
      if (`${data.id}.md` !== name) throw new Error(`company/agents/${name} has id "${data.id}"`);
      return { ...data, body: parsed.content.trim(), file };
    })
    .sort((a, b) => a.order - b.order);

  const okrSource = read(dir, "okrs.md");
  const manualSource = read(dir, "manual.md");
  files.push(okrSource.file, manualSource.file);
  const okrs = z.object({ okrs: z.array(OkrSchema) }).parse(matter(okrSource.text).data).okrs;
  return { agents, okrs, manual: manualSource.text, files };
}

export function companyProblems(company: Company): string[] {
  const problems: string[] = [];
  const ids = new Set(company.agents.map((a) => a.id));
  const roots = company.agents.filter((a) => a.parent === null);
  if (roots.length !== 1 || roots[0].kind !== "ceo") problems.push("exactly one agent, of kind ceo, has no parent");
  for (const a of company.agents) {
    if (a.parent !== null && !ids.has(a.parent)) problems.push(`${a.id}: parent "${a.parent}" is not an agent`);
    if (a.kind === "dept" && a.tasks?.length) problems.push(`${a.id}: a department runs no task`);
    if (a.kind !== "dept" && a.status !== "Proposed" && !a.tasks?.length) problems.push(`${a.id}: no scheduled task`);
    if (a.kind !== "dept" && !/^#{2,3} Finish\b/m.test(a.body)) problems.push(`${a.id}: body has no "## Finish" section`);
    if (/BODY_PENDING/.test(a.body)) problems.push(`${a.id}: body not written`);
  }
  const seen = new Set<string>();
  for (const a of company.agents) {
    let node: Agent | undefined = a;
    seen.clear();
    while (node && node.parent !== null) {
      if (seen.has(node.id)) {
        problems.push(`${a.id}: its parents loop`);
        break;
      }
      seen.add(node.id);
      node = company.agents.find((x) => x.id === node!.parent);
    }
  }
  const okrIds = new Set<string>();
  for (const o of company.okrs) {
    if (okrIds.has(o.id)) problems.push(`OKR ${o.id} is listed twice`);
    okrIds.add(o.id);
  }
  for (const o of company.okrs) {
    if (o.owner !== "company" && !ids.has(o.owner)) problems.push(`OKR ${o.id}: owner "${o.owner}" is not an agent`);
    if (o.parent && !okrIds.has(o.parent)) problems.push(`OKR ${o.id}: parent "${o.parent}" is not an OKR`);
  }
  return problems;
}

export type AgentNode = Agent & { children: AgentNode[] };

export function agentTree(agents: Agent[]): AgentNode | null {
  const nodes = new Map(agents.map((a) => [a.id, { ...a, children: [] as AgentNode[] }]));
  let root: AgentNode | null = null;
  for (const node of [...nodes.values()].sort((a, b) => a.order - b.order)) {
    const parent = node.parent === null ? undefined : nodes.get(node.parent);
    if (parent) parent.children.push(node);
    else if (node.parent === null) root = node;
  }
  return root;
}
