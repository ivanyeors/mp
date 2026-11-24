import { REPORT_KINDS, type ReportTone } from "./report";
import type { Agent, AgentNode, Okr } from "./roster";
import { sgDate, type AgentView, type Beat, type CopyState, type OkrValue } from "./overview";

export type Team = { id: string; name: string };
export type Teams = { teams: Team[]; teamOf: Map<string, string> };

export function teamsOf(root: AgentNode): Teams {
  const teamOf = new Map<string, string>([[root.id, root.id]]);
  const walk = (node: AgentNode, team: string) => {
    teamOf.set(node.id, team);
    for (const child of node.children) walk(child, team);
  };
  for (const child of root.children) walk(child, child.id);
  return { teams: root.children.map((c) => ({ id: c.id, name: c.name.replace(/ Lead$/, "") })), teamOf };
}

export type TeamDay = { date: string; total: number; byTeam: Record<string, number> };

export function reportsByTeam(views: AgentView[], teamOf: Map<string, string>, now: Date, days = 30): TeamDay[] {
  const counts = new Map<string, Record<string, number>>();
  for (const v of views) {
    const team = teamOf.get(v.agent.id);
    if (!team) continue;
    for (const o of v.outputs) {
      if (!(REPORT_KINDS as readonly string[]).includes(o.name.kind)) continue;
      const day = counts.get(o.name.date) ?? {};
      day[team] = (day[team] ?? 0) + 1;
      counts.set(o.name.date, day);
    }
  }
  return Array.from({ length: days }, (_, i) => {
    const date = sgDate(new Date(now.getTime() - (days - 1 - i) * 86_400_000));
    const byTeam = counts.get(date) ?? {};
    return { date, byTeam, total: Object.values(byTeam).reduce((s, n) => s + n, 0) };
  });
}

export type Outcome = Exclude<ReportTone, "unknown"> | "filed" | "missed";
export const OUTCOMES: Outcome[] = ["ok", "unchanged", "filed", "degraded", "failed", "missed"];

export function outcomeOf(beat: Beat): Outcome | null {
  if (beat.state === "missed") return "missed";
  if (beat.state === "before") return null;
  return !beat.tone || beat.tone === "unknown" ? "filed" : beat.tone;
}

const inWindow = (beat: Beat, now: Date, days: number) => {
  const t = new Date(beat.due).getTime();
  return t <= now.getTime() && t > now.getTime() - days * 86_400_000;
};

export function outcomeCounts(views: AgentView[], now: Date, days = 56): Record<Outcome, number> {
  const counts = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
  for (const v of views) {
    for (const beat of v.beats) {
      const outcome = outcomeOf(beat);
      if (outcome && inWindow(beat, now, days)) counts[outcome] += 1;
    }
  }
  return counts;
}

export type Mark = { due: string; at: number; outcome: Outcome | "before" };
export type Lane = { id: string; name: string; team: string; marks: Mark[] };

export function runLanes(views: AgentView[], teamOf: Map<string, string>, now: Date, days = 56): Lane[] {
  const span = days * 86_400_000;
  const start = now.getTime() - span;
  return views
    .filter((v) => v.agent.kind !== "dept" && v.beats.length > 0)
    .map((v) => ({
      id: v.agent.id,
      name: v.agent.name,
      team: teamOf.get(v.agent.id) ?? v.agent.id,
      marks: v.beats
        .filter((b) => inWindow(b, now, days))
        .map((b) => ({ due: b.due, at: (new Date(b.due).getTime() - start) / span, outcome: outcomeOf(b) ?? ("before" as const) })),
    }));
}

export type Ratio = { label: string; done: number; of: number; note: string };

export function fleetRatios(views: AgentView[], copies: CopyState[] | null, okrs: Okr[], values: Record<string, OkrValue>): Ratio[] {
  const runners = views.filter((v) => v.agent.kind !== "dept");
  const beats = runners.flatMap((v) => v.beats).map(outcomeOf).filter((o): o is Outcome => o !== null);
  const filed = beats.filter((o) => o !== "missed");
  const krs = okrs.filter((o) => o.level === "KR" && o.owner === "company");
  const ratios: Ratio[] = [
    { label: "Agents live", done: runners.filter((v) => v.agent.status === "Live").length, of: runners.length, note: "Scheduled and switched on" },
    { label: "Runs filed on time", done: filed.length, of: beats.length, note: "Last 10 scheduled runs per agent" },
    { label: "Reports clean", done: filed.filter((o) => o === "ok" || o === "unchanged" || o === "filed").length, of: filed.length, note: "Not degraded or failed" },
    { label: "Key results reported", done: krs.filter((k) => values[k.id]).length, of: krs.length, note: "Company KRs with a current value" },
  ];
  if (copies) ratios.splice(1, 0, { label: "Instructions in sync", done: copies.filter((c) => c.state === "same").length, of: copies.length, note: "Drive copy matches the code" });
  return ratios;
}

export type NetNode = { id: string; name: string; kind: Agent["kind"]; team: string; x: number; y: number; ring: 0 | 1 | 2 };
export type NetEdge = { from: string; to: string };

const INNER = 0.52;
const OUTER = 0.9;

export function networkLayout(root: AgentNode): { nodes: NetNode[]; edges: NetEdge[] } {
  const nodes: NetNode[] = [{ id: root.id, name: root.name, kind: root.kind, team: root.id, x: 0, y: 0, ring: 0 }];
  const edges: NetEdge[] = [];
  const members = (node: AgentNode): AgentNode[] => node.children.flatMap((c) => [c, ...members(c)]);
  const sizes = root.children.map((t) => Math.max(1, members(t).length));
  const total = sizes.reduce((s, n) => s + n, 0);
  const at = (angle: number, r: number) => ({ x: Math.round(Math.cos(angle) * r * 1000) / 1000, y: Math.round(Math.sin(angle) * r * 1000) / 1000 });
  let start = -Math.PI / 2 - (Math.PI * sizes[0]) / Math.max(1, total);
  root.children.forEach((team, i) => {
    const width = (2 * Math.PI * sizes[i]) / Math.max(1, total);
    nodes.push({ id: team.id, name: team.name, kind: team.kind, team: team.id, ring: 1, ...at(start + width / 2, INNER) });
    edges.push({ from: root.id, to: team.id });
    const list = members(team);
    list.forEach((m, j) => {
      nodes.push({ id: m.id, name: m.name, kind: m.kind, team: team.id, ring: 2, ...at(start + ((j + 0.5) * width) / list.length, OUTER) });
      edges.push({ from: m.parent ?? team.id, to: m.id });
    });
    start += width;
  });
  return { nodes, edges };
}
