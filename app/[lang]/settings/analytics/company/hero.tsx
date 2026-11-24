import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { AGENTS_FOLDER_URL } from "@/lib/company/drive";
import type { Outputs } from "@/lib/company/load";
import type { Overview } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { fmtTime } from "./format";
import { RefreshButton } from "./refresh-button";

function SourcePill({ outputs }: { outputs: Outputs }) {
  const [tone, label] =
    outputs.state === "ok"
      ? [outputs.source === "local" ? "bg-sky-400" : "bg-emerald-400", outputs.source === "local" ? `Sample outputs · ${fmtTime(outputs.listedAt)}` : `Live from Google Drive · ${fmtTime(outputs.listedAt)}`]
      : outputs.state === "unconfigured"
        ? ["bg-amber-400", "Google Drive is not connected"]
        : ["bg-red-400", "Google Drive could not be read"];
  return (
    <span className="inline-flex h-8 items-center gap-2 rounded-full border border-border bg-card px-3 text-xs text-muted-foreground shadow-sm">
      <span className="relative flex h-2 w-2">
        {outputs.state === "ok" ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden", tone)} /> : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone)} />
      </span>
      {label}
    </span>
  );
}

function Tile({ label, value, of, sub, tone, ok }: { label: string; value: number; of?: number; sub: string; tone?: "warn" | "bad"; ok: boolean }) {
  return (
    <div className="rounded-[18px] border border-border bg-card px-4 py-3.5 shadow-sm transition hover:border-foreground/20">
      <dt className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <span className={cn("h-3 w-[3px] rounded-full", tone === "bad" ? "bg-destructive" : tone === "warn" ? "bg-amber-500" : "bg-foreground")} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2">
        <span className={cn("text-[2rem] font-light leading-none tracking-tight tabular-nums", tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-foreground")}>
          {ok ? <span className="inline-block animate-in fade-in-0 slide-in-from-bottom-1 duration-500 motion-reduce:animate-none">{value}</span> : "—"}
        </span>
        {ok && of !== undefined ? <span className="ml-1 text-xs text-muted-foreground">/{of}</span> : null}
        <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{sub}</span>
      </dd>
    </div>
  );
}

export function Hero({ overview, outputs, teams, attention, sync }: { overview: Overview; outputs: Outputs; teams: number; attention: number; sync: { same: number; total: number } | null }) {
  const s = overview.stats;
  const ok = outputs.state === "ok";
  return (
    <section aria-labelledby="company-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-[11px] uppercase tracking-[0.32em] text-muted-foreground">{"// Analytics · Company"}</p>
          <h1 id="company-title" className="text-4xl font-semibold tracking-tight text-foreground md:text-5xl">Company</h1>
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[13px] text-muted-foreground">
            {ok && attention ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-destructive">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden="true" />
                {attention} need{attention === 1 ? "s" : ""} attention
              </span>
            ) : null}
            <span>{s.total} agents</span>
            <span aria-hidden="true">·</span>
            <span>{teams} teams</span>
            <span aria-hidden="true">·</span>
            <span>{s.live}/{s.total} live</span>
            <span aria-hidden="true">·</span>
            <span>Agent 0 reports to the founder</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourcePill outputs={outputs} />
          <Link
            href={AGENTS_FOLDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm transition hover:bg-muted"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Drive folder
          </Link>
          <RefreshButton />
        </div>
      </div>

      <dl className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
        <Tile ok label="Agents live" value={s.live} of={s.total} sub={`${s.total - s.live} paused or waiting`} />
        <Tile ok={ok} label="Reports · 7 days" value={s.reportsThisWeek} sub="Filed in Drive" />
        <Tile ok={ok} label="Decisions" value={s.decisions} sub={s.overdue ? `${s.overdue} past their date` : "None overdue"} tone={s.overdue ? "warn" : undefined} />
        <Tile ok={ok} label="Urgent alerts" value={s.urgentAlerts} sub="Critical or high" tone={s.urgentAlerts ? "bad" : undefined} />
        <Tile ok={sync !== null} label="Instructions" value={sync?.same ?? 0} of={sync?.total} sub={!sync ? "Checked against Drive when live" : sync.same < sync.total ? "Drive copy differs from the code" : "Drive copy matches the code"} tone={sync && sync.same < sync.total ? "warn" : undefined} />
      </dl>
    </section>
  );
}
