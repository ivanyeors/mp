export const REPORT_KINDS = ["weekly", "fortnightly", "monthly", "quarterly"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export type OutputName = {
  date: string;
  agent: string;
  kind: ReportKind | "draft" | "file";
  slug: string | null;
  ext: "md" | "csv" | null;
};

const OUTPUT_NAME = /^(\d{4}-\d{2}-\d{2})_([a-z0-9]+(?:-[a-z0-9]+)*)_(.+?)(?:\.(md|csv))?$/;

export function parseOutputName(name: string): OutputName | null {
  const m = OUTPUT_NAME.exec(name.trim());
  if (!m) return null;
  const [, date, agent, rest, ext] = m;
  const isReport = (REPORT_KINDS as readonly string[]).includes(rest);
  const kind: OutputName["kind"] = isReport ? (rest as ReportKind) : rest.startsWith("draft_") ? "draft" : "file";
  const slug = kind === "draft" ? rest.slice("draft_".length) : kind === "file" ? rest : null;
  return { date, agent, kind, slug, ext: ext === "md" || ext === "csv" ? ext : null };
}

const isRow = (line: string | undefined) => line !== undefined && /^\s*\|.*\|\s*$/.test(line);
const isSeparator = (line: string | undefined) => line !== undefined && /^\s*\|(\s*:?-{3,}:?\s*\|)+\s*$/.test(line);

export function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export function fromDocsMarkdown(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .replace(/\\([\\`*_{}[\]()#+\-.!|>~<=])/g, "$1")
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line.replace(/\s+$/, "")));
  const kept: string[] = [];
  lines.forEach((line, i) => {
    if (line === "" && isRow(kept.at(-1)) && isRow(lines.slice(i + 1).find((l) => l !== ""))) return;
    kept.push(line);
  });
  const out: string[] = [];
  kept.forEach((line, i) => {
    out.push(line);
    const startsTable = isRow(line) && !isRow(kept[i - 1]);
    if (startsTable && isRow(kept[i + 1]) && !isSeparator(kept[i + 1])) {
      out.push(`|${" --- |".repeat(splitRow(line).length)}`);
    }
  });
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}

export type Rag = "green" | "amber" | "red" | null;
export type ReportTone = "ok" | "unchanged" | "degraded" | "failed" | "unknown";
export type Severity = "critical" | "high" | "medium" | "low";

export type ReportNumber = { kpi: string; now: string; before: string; target: string; status: string; rag: Rag; source: string };
export type ReportDecision = { id: string | null; question: string; fields: Record<string, string>; decideBy: string | null };
export type ReportAlert = { severity: Severity | null; text: string; deadline: string | null };
export type ReportOkr = { id: string; text: string; current: string; target: string; status: string };

export type Report = {
  title: string | null;
  status: string | null;
  tone: ReportTone;
  headline: string | null;
  numbers: ReportNumber[];
  findings: string[];
  decisions: ReportDecision[];
  drafts: string[];
  okrs: ReportOkr[];
  alerts: ReportAlert[];
  dataGaps: string[];
};

export function reportTone(status: string | null): ReportTone {
  if (!status) return "unknown";
  if (/fail/i.test(status)) return "failed";
  if (/degrad|partial/i.test(status)) return "degraded";
  if (/no material change/i.test(status)) return "unchanged";
  if (/\bok\b|succeed/i.test(status)) return "ok";
  return "unknown";
}

export function ragOf(text: string): Rag {
  const t = text.toLowerCase();
  if (/\bred\b/.test(t)) return "red";
  if (/\bamber\b/.test(t)) return "amber";
  if (/\bgreen\b/.test(t)) return "green";
  return null;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export function parseLongDate(text: string): string | null {
  const iso = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const m = /\b(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})\b/.exec(text);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

type Section = { name: string; lines: string[] };

function sections(markdown: string): Section[] {
  const out: Section[] = [{ name: "", lines: [] }];
  for (const line of markdown.split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading && !line.startsWith("###")) out.push({ name: heading[1].toLowerCase(), lines: [] });
    else out[out.length - 1].lines.push(line);
  }
  return out;
}

function section(all: Section[], prefix: string): string[] {
  return all.find((s) => s.name.startsWith(prefix))?.lines ?? [];
}

const NONE = /^(none\.?|n\/a|—|-)$/i;

function bullets(lines: string[]): string[] {
  return lines
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, "").trim())
    .filter((l) => l && !NONE.test(l));
}

function table(lines: string[]): Record<string, string>[] {
  const rows = lines.filter((l) => isRow(l) && !isSeparator(l));
  if (rows.length < 2) return [];
  const header = splitRow(rows[0]).map((h) => h.toLowerCase());
  return rows.slice(1).map((row) => {
    const cells = splitRow(row);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const name of names) {
    const key = Object.keys(row).find((k) => k === name || k.startsWith(`${name} `) || k.startsWith(`${name}(`));
    if (key !== undefined) return row[key];
  }
  return "";
}

function decision(text: string): ReportDecision {
  const [first, ...rest] = text.split(/\s+\|\s+/);
  const head = /^([a-z0-9-]+-\d{4}-\d{2}-\d+|[a-z0-9-]+-\d+)\s*:\s*(.+)$/i.exec(first);
  const fields: Record<string, string> = {};
  for (const part of rest) {
    const kv = /^([^:]{1,40}):\s*(.*)$/.exec(part);
    if (kv) fields[kv[1].trim().toLowerCase()] = kv[2].trim();
  }
  const by = fields["decide by"] ?? "";
  return { id: head ? head[1] : null, question: head ? head[2].trim() : first.trim(), fields, decideBy: parseLongDate(by) };
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];

function alert(text: string): ReportAlert {
  const parts = text.split(/\s+[—–]\s+/);
  const first = parts[0]?.trim().toLowerCase() ?? "";
  const severity = SEVERITIES.find((s) => first === s) ?? null;
  const body = severity ? parts.slice(1) : parts;
  const last = body.at(-1) ?? "";
  const deadlineMatch = /^deadline:\s*(.*)$/i.exec(last.trim());
  const deadline = deadlineMatch && !NONE.test(deadlineMatch[1].trim()) && !/^none$/i.test(deadlineMatch[1].trim()) ? deadlineMatch[1].trim() : null;
  const words = (deadlineMatch ? body.slice(0, -1) : body).join(" — ").trim();
  return { severity, text: words, deadline };
}

export function parseReport(markdown: string): Report {
  const all = sections(markdown.replace(/\r\n?/g, "\n"));
  const preamble = all[0].lines;
  const title = preamble.map((l) => /^#\s+(.+?)\s*$/.exec(l)?.[1]).find(Boolean) ?? null;
  const field = (name: string) =>
    markdown.split("\n").map((l) => new RegExp(`^\\**${name}\\**\\s*:\\s*(.+?)\\s*$`, "i").exec(l.trim())?.[1]).find(Boolean) ?? null;
  const status = field("Status");
  return {
    title,
    status,
    tone: reportTone(status),
    headline: field("Headline"),
    numbers: table(section(all, "numbers")).map((r) => {
      const statusCell = pick(r, "status");
      return {
        kpi: pick(r, "kpi"),
        now: pick(r, "now"),
        before: pick(r, "before"),
        target: pick(r, "target"),
        status: statusCell,
        rag: ragOf(statusCell),
        source: pick(r, "source"),
      };
    }).filter((n) => n.kpi),
    findings: bullets(section(all, "findings")),
    decisions: bullets(section(all, "decisions")).map(decision),
    drafts: bullets(section(all, "drafts")),
    okrs: table(section(all, "okr progress")).map((r) => ({
      id: pick(r, "kr id", "kr", "id"),
      text: pick(r, "key result"),
      current: pick(r, "current"),
      target: pick(r, "target"),
      status: pick(r, "status"),
    })).filter((o) => o.id),
    alerts: bullets(section(all, "alerts")).map(alert),
    dataGaps: bullets(section(all, "data gaps")),
  };
}

export function withoutHeader(markdown: string): string {
  const lines = markdown.split("\n");
  const firstSection = lines.findIndex((l) => /^##\s/.test(l));
  const end = firstSection === -1 ? lines.length : firstSection;
  const drop = new Set<number>();
  const firstOf = (re: RegExp) => lines.slice(0, end).findIndex((l) => re.test(l.trim()));
  for (const re of [/^#\s/, /^\**Status\**\s*:/i, /^\**Headline\**\s*:/i]) {
    const i = firstOf(re);
    if (i !== -1) drop.add(i);
  }
  return lines.filter((_, i) => !drop.has(i)).join("\n").replace(/^\s*\n+/, "");
}
