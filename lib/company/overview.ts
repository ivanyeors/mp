import type { OutputFile } from "./drive";
import { REPORT_KINDS, parseOutputName, type OutputName, type Report, type ReportAlert, type ReportDecision, type ReportTone, type Severity } from "./report";
import type { Agent, Company, CompanyFile, Okr } from "./roster";
import { nextRun, previousRun } from "./schedule";

export type Output = { file: OutputFile; name: OutputName };
export type Beat = { due: string; state: "filed" | "missed" | "before"; tone: ReportTone | null };
export type Health = "ok" | "unchanged" | "degraded" | "failed" | "missed" | "none" | "paused" | "group";

export type AgentView = {
  agent: Agent;
  nextRun: string | null;
  lastDue: string | null;
  latest: (Output & { report: Report | null }) | null;
  outputs: Output[];
  health: Health;
  beats: Beat[];
};

export type DecisionView = ReportDecision & { agent: string; date: string; overdue: boolean };
export type AlertView = ReportAlert & { agent: string; date: string };
export type DraftView = { agent: string; date: string; text: string };
export type OkrValue = { current: string; status: string; agent: string; date: string };
export type CopyState = { path: string; state: "same" | "differs" | "missing" };

export type Overview = {
  agents: AgentView[];
  decisions: DecisionView[];
  alerts: AlertView[];
  drafts: DraftView[];
  okrValues: Record<string, OkrValue>;
  feed: (Output & { report: Report | null })[];
  copies: CopyState[];
  stats: { live: number; total: number; reportsThisWeek: number; decisions: number; overdue: number; urgentAlerts: number; drafts: number };
};

const SG_OFFSET_MS = 8 * 60 * 60 * 1000;
const RUN_GRACE_MS = 2 * 60 * 60 * 1000;
const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const sgDate = (d: Date) => new Date(d.getTime() + SG_OFFSET_MS).toISOString().slice(0, 10);

const isReport = (o: Output) => (REPORT_KINDS as readonly string[]).includes(o.name.kind);

function newestFirst(a: Output, b: Output): number {
  return b.name.date.localeCompare(a.name.date) || b.file.modifiedTime.localeCompare(a.file.modifiedTime) || a.file.name.localeCompare(b.file.name);
}

export function outputsOf(files: OutputFile[]): Output[] {
  return files
    .filter((f) => /^\d{4}\/\d{4}-\d{2}$/.test(f.folder))
    .flatMap((file) => {
      const name = parseOutputName(file.name);
      return name ? [{ file, name }] : [];
    })
    .sort(newestFirst);
}

export function latestReports(outputs: Output[]): Map<string, Output> {
  const latest = new Map<string, Output>();
  for (const o of outputs) if (isReport(o) && !latest.has(o.name.agent)) latest.set(o.name.agent, o);
  return latest;
}

function schedules(agent: Agent): string[] {
  return (agent.tasks ?? []).map((t) => t.schedule);
}

export const BEATS = 10;

export function beatsOf(schedule: string | null, reports: Output[], toneOf: (o: Output) => ReportTone | null, now: Date, count = BEATS): Beat[] {
  if (!schedule) return [];
  const dues: Date[] = [];
  let cursor = now;
  while (dues.length < count) {
    const due = previousRun(schedule, cursor);
    if (!due) break;
    dues.unshift(due);
    cursor = new Date(due.getTime() - 60_000);
  }
  const first = reports.map((o) => o.name.date).sort()[0] ?? null;
  return dues.map((due, i) => {
    const from = sgDate(due);
    const until = i + 1 < dues.length ? sgDate(dues[i + 1]) : "9999-12-31";
    const filed = reports.filter((o) => o.name.date >= from && o.name.date < until).sort(newestFirst)[0];
    if (filed) return { due: due.toISOString(), state: "filed", tone: toneOf(filed) };
    const pending = i === dues.length - 1 && now.getTime() - due.getTime() <= RUN_GRACE_MS;
    if (!first || from < first || pending) return { due: due.toISOString(), state: "before", tone: null };
    return { due: due.toISOString(), state: "missed", tone: null };
  });
}

function health(agent: Agent, report: Report | null, latestDate: string | null, lastDue: Date | null, now: Date): Health {
  if (agent.kind === "dept") return "group";
  if (agent.status === "Paused") return "paused";
  if (!latestDate) return "none";
  if (lastDue && now.getTime() - lastDue.getTime() > RUN_GRACE_MS && latestDate < sgDate(lastDue)) return "missed";
  const tone = report?.tone ?? "unknown";
  return tone === "unknown" ? "ok" : tone;
}

export function copyStates(repoFiles: CompanyFile[], files: OutputFile[]): CopyState[] {
  const drive = new Map(
    files
      .filter((f) => f.folder === "_company" || f.folder === "_company/agents")
      .map((f) => [f.folder === "_company" ? f.name : `agents/${f.name}`, f.md5]),
  );
  return repoFiles.map(({ path, md5 }) => ({
    path,
    state: !drive.has(path) ? "missing" : drive.get(path) === md5 ? "same" : "differs",
  }));
}

export function buildOverview(company: Company, files: OutputFile[], reports: Map<string, Report>, now: Date): Overview {
  const outputs = outputsOf(files);
  const latest = latestReports(outputs);
  const today = sgDate(now);

  const agents: AgentView[] = company.agents.map((agent) => {
    const mine = outputs.filter((o) => o.name.agent === agent.id);
    const last = latest.get(agent.id) ?? null;
    const report = last ? reports.get(last.file.id) ?? null : null;
    const next = schedules(agent).map((s) => nextRun(s, now)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const due = schedules(agent).map((s) => previousRun(s, now)).filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      agent,
      nextRun: agent.status === "Live" && next ? next.toISOString() : null,
      lastDue: due ? due.toISOString() : null,
      latest: last ? { ...last, report } : null,
      outputs: mine,
      health: health(agent, report, last?.name.date ?? null, agent.status === "Live" ? due : null, now),
      beats: agent.status === "Live" || agent.status === "Paused"
        ? beatsOf(schedules(agent)[0] ?? null, mine.filter(isReport), (o) => reports.get(o.file.id)?.tone ?? null, now)
        : [],
    };
  });

  const withReports = agents.flatMap((a) => (a.latest?.report ? [{ id: a.agent.id, date: a.latest.name.date, report: a.latest.report }] : []));

  const decisions = withReports
    .flatMap(({ id, date, report }) => report.decisions.map((d) => ({ ...d, agent: id, date, overdue: d.decideBy !== null && d.decideBy < today })))
    .sort((a, b) => Number(b.overdue) - Number(a.overdue) || (a.decideBy ?? "9999").localeCompare(b.decideBy ?? "9999"));

  const alerts = withReports
    .flatMap(({ id, date, report }) => report.alerts.map((a) => ({ ...a, agent: id, date })))
    .sort((a, b) => (SEVERITY_RANK[a.severity ?? "low"] - SEVERITY_RANK[b.severity ?? "low"]) || b.date.localeCompare(a.date));

  const drafts = withReports.flatMap(({ id, date, report }) => report.drafts.map((text) => ({ agent: id, date, text })));

  const okrValues: Record<string, OkrValue> = {};
  for (const { id, date, report } of [...withReports].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const row of report.okrs) {
      if (!row.current && !row.status) continue;
      okrValues[row.id] = { current: row.current, status: row.status, agent: id, date };
    }
  }

  const weekAgo = sgDate(new Date(now.getTime() - 7 * 86_400_000));
  const feed = outputs.filter(isReport).slice(0, 40).map((o) => ({ ...o, report: reports.get(o.file.id) ?? null }));
  const runners = agents.filter((a) => a.agent.kind !== "dept");

  return {
    agents,
    decisions,
    alerts,
    drafts,
    okrValues,
    feed,
    copies: copyStates(company.files, files),
    stats: {
      live: runners.filter((a) => a.agent.status === "Live").length,
      total: runners.length,
      reportsThisWeek: outputs.filter((o) => isReport(o) && o.name.date > weekAgo).length,
      decisions: decisions.length,
      overdue: decisions.filter((d) => d.overdue).length,
      urgentAlerts: alerts.filter((a) => a.severity === "critical" || a.severity === "high").length,
      drafts: drafts.length,
    },
  };
}

export type OkrBranch = { okr: Okr; krs: (Okr & { aligned: Okr[] })[] };

export function okrTree(okrs: Okr[]): OkrBranch[] {
  return okrs
    .filter((o) => o.owner === "company" && o.level === "Objective")
    .map((objective) => ({
      okr: objective,
      krs: okrs
        .filter((k) => k.level === "KR" && k.parent === objective.id)
        .map((kr) => ({ ...kr, aligned: okrs.filter((a) => a.level === "KR" && a.owner !== "company" && a.parent === kr.id) })),
    }));
}
