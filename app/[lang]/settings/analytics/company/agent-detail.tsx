import Link from "next/link";
import { CalendarClock, ExternalLink, FileText, Sheet as SheetIcon, Target } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { parseCsv } from "@/lib/csv";
import type { AgentView, Output, OkrValue } from "@/lib/company/overview";
import { parseReport, withoutHeader } from "@/lib/company/report";
import type { Okr } from "@/lib/company/roster";
import { cn } from "@/lib/utils";
import { Empty, Heartbeat, LABEL, Pill } from "./bits";
import { AgentFace } from "./faces";
import { HEALTH, RAG, agentHref, fmtDay, fmtDayYear, fmtWhen, okrTone } from "./format";

const CSV_ROWS = 200;

function CsvTable({ text }: { text: string }) {
  const [header = [], ...rows] = parseCsv(text);
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/60">
            <tr>{header.map((h, i) => <th key={i} className="whitespace-nowrap border-b px-2.5 py-2 font-medium text-muted-foreground">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.slice(0, CSV_ROWS).map((row, r) => (
              <tr key={r} className="border-b last:border-b-0">
                {header.map((_, c) => <td key={c} className="px-2.5 py-1.5 align-top">{row[c] ?? ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > CSV_ROWS ? <p className="text-xs text-muted-foreground">First {CSV_ROWS} of {rows.length} rows. Open the file in Drive for the rest.</p> : null}
    </div>
  );
}

function Viewer({ output, content }: { output: Output; content: string | null }) {
  const isCsv = output.name.ext === "csv" || output.file.mimeType === "text/csv" || output.file.mimeType.endsWith(".spreadsheet");
  const report = content && !isCsv ? parseReport(content) : null;
  return (
    <article aria-label={output.file.name} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          {isCsv ? <SheetIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate font-mono">{output.file.name}</span>
          <span className="shrink-0">· {fmtDayYear(output.name.date)}</span>
        </p>
        {output.file.webViewLink ? (
          <a href={output.file.webViewLink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Open in Drive <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {report?.headline ? (
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-muted/80 via-muted/30 to-transparent p-4">
          {report.status ? (
            <Pill className={cn("mb-2 bg-background ring-1 ring-border", HEALTH[report.tone === "unknown" ? "none" : report.tone].text)}>{report.status}</Pill>
          ) : null}
          <p className="text-[17px] font-medium leading-7 tracking-tight">{report.headline}</p>
        </div>
      ) : null}
      {content === null ? (
        <Empty>This file could not be read from Google Drive. Open it in Drive instead.</Empty>
      ) : isCsv ? (
        <CsvTable text={content} />
      ) : (
        <Markdown>{report?.headline ? withoutHeader(content) : content}</Markdown>
      )}
    </article>
  );
}

export function AgentDetail({
  view,
  chain,
  shown,
  content,
  okrs,
  values,
}: {
  view: AgentView;
  chain: string[];
  shown: Output | null;
  content: string | null;
  okrs: Okr[];
  values: Record<string, OkrValue>;
}) {
  const { agent } = view;
  const numbers = shown && shown.file.id === view.latest?.file.id ? (view.latest?.report?.numbers ?? []) : [];
  const krs = okrs.filter((o) => o.owner === agent.id && o.level === "KR");
  const filed = view.beats.filter((b) => b.state === "filed").length;
  return (
    <div className="flex shrink-0 flex-col">
      <header className="relative shrink-0 overflow-hidden border-b bg-gradient-to-br from-muted/80 via-muted/30 to-background px-5 pb-5 pt-6 md:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
        <p className={cn(LABEL, "pr-10")}>{chain.join(" → ")}</p>
        <div className="mt-2 flex items-start gap-3 pr-10">
          <AgentFace id={agent.id} health={view.health} size="lg" />
          <div className="min-w-0">
            <h2 className="text-2xl font-semibold leading-tight tracking-tight">{agent.name}</h2>
            {agent.mission ? <p className="mt-1 text-sm text-muted-foreground">{agent.mission}</p> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-1.5">
          <Pill className={cn("bg-background ring-1 ring-border", HEALTH[view.health].text)}>{HEALTH[view.health].label}</Pill>
          {agent.cadence ? (
            <Pill className="bg-background text-foreground ring-1 ring-border">
              <CalendarClock className="h-3 w-3" aria-hidden="true" />
              {agent.cadence}
            </Pill>
          ) : null}
          {view.nextRun ? <Pill className="bg-background text-foreground ring-1 ring-border">Next {fmtWhen(view.nextRun)}</Pill> : null}
          {agent.framework ? (
            <Pill className="bg-background text-foreground ring-1 ring-border">
              <Target className="h-3 w-3" aria-hidden="true" />
              {agent.framework}
            </Pill>
          ) : null}
          {agent.link ? (
            <a href={agent.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground transition hover:opacity-90">
              Its dashboard <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
        </div>
        {view.beats.length ? (
          <div className="mt-4 flex items-end gap-3">
            <Heartbeat beats={view.beats} big />
            <p className="text-[11px] leading-4 text-muted-foreground">
              Last {view.beats.length} scheduled runs
              <span className="block">{filed} filed a report</span>
            </p>
          </div>
        ) : null}
      </header>

      <div className="flex-1 space-y-6 px-5 py-5 md:px-7">
        {numbers.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {numbers.map((n) => (
              <div key={n.kpi} className="rounded-xl border bg-card p-3">
                <p className="flex items-start gap-1.5 text-[11px] leading-4 text-muted-foreground">
                  <span className={cn("mt-1 h-1.5 w-1.5 shrink-0 rounded-full", n.rag ? RAG[n.rag] : "bg-muted-foreground/40")} aria-hidden="true" />
                  {n.kpi}
                </p>
                <p className="mt-1 text-lg font-semibold leading-6 tabular-nums">{n.now || "—"}</p>
                {n.target || n.before ? (
                  <p className="text-[11px] text-muted-foreground">
                    {n.before ? `was ${n.before}` : ""}
                    {n.before && n.target ? " · " : ""}
                    {n.target ? `target ${n.target}` : ""}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {shown ? (
          <Viewer output={shown} content={content} />
        ) : (
          <Empty>
            {agent.kind === "dept"
              ? "A department files nothing itself. Open one of its agents."
              : view.nextRun
                ? `No report in Drive yet. Next run ${fmtWhen(view.nextRun)}.`
                : "No report in Drive yet."}
          </Empty>
        )}

        <div className="grid gap-6 md:grid-cols-2">
          {krs.length ? (
            <div>
              <h3 className={cn(LABEL, "mb-2")}>Key results</h3>
              <ul className="space-y-2.5">
                {krs.map((kr) => (
                  <li key={kr.id} className="text-xs">
                    <p className="leading-4"><span className="font-mono text-muted-foreground">{kr.id}</span> {kr.text}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Pill className={okrTone(values[kr.id]?.status)}>{values[kr.id]?.status || "Not measured"}</Pill>
                      <span className="text-muted-foreground">{values[kr.id]?.current || kr.baseline || "—"} → {kr.target || "—"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div>
            <h3 className={cn(LABEL, "mb-2")}>Files in Drive</h3>
            {view.outputs.length ? (
              <ul className="space-y-0.5">
                {view.outputs.slice(0, 24).map((o) => (
                  <li key={o.file.id}>
                    <Link
                      href={agentHref(agent.id, o.file.id)}
                      scroll={false}
                      aria-current={shown?.file.id === o.file.id ? "true" : undefined}
                      className={cn("flex items-baseline gap-2 rounded-md px-1.5 py-1 text-xs transition hover:bg-muted", shown?.file.id === o.file.id && "bg-muted font-medium")}
                    >
                      <span className="shrink-0 font-mono tabular-nums text-muted-foreground">{fmtDay(o.name.date)}</span>
                      <span className="truncate">{o.name.kind === "draft" ? `Draft · ${o.name.slug}` : o.name.kind === "file" ? o.name.slug : `${o.name.kind[0].toUpperCase()}${o.name.kind.slice(1)} report`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Nothing filed yet.</p>
            )}
          </div>
        </div>

        {agent.kind !== "dept" ? (
          <details className="group rounded-2xl border bg-muted/20">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:hidden">
              <span className="mr-1 inline-block transition group-open:rotate-90">›</span> How this agent works
              <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">company/{agent.file.path}</span>
            </summary>
            <div className="border-t px-4 py-3">
              <Markdown>{agent.body}</Markdown>
            </div>
          </details>
        ) : null}
      </div>
    </div>
  );
}
