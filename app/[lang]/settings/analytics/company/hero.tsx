import Link from "next/link";
import { FolderOpen } from "lucide-react";
import { AGENTS_FOLDER_URL } from "@/lib/company/drive";
import type { Outputs } from "@/lib/company/load";
import type { AgentView, Overview } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { HEALTH, agentHref, fmtTime } from "./format";
import { RefreshButton } from "./refresh-button";

function SourcePill({ outputs }: { outputs: Outputs }) {
  const [tone, label] =
    outputs.state === "ok"
      ? [outputs.source === "local" ? "bg-sky-400" : "bg-emerald-400", outputs.source === "local" ? `Sample outputs · ${fmtTime(outputs.listedAt)}` : `Live from Google Drive · ${fmtTime(outputs.listedAt)}`]
      : outputs.state === "unconfigured"
        ? ["bg-amber-400", "Google Drive is not connected"]
        : ["bg-red-400", "Google Drive could not be read"];
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300">
      <span className="relative flex h-2 w-2">
        {outputs.state === "ok" ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 motion-reduce:hidden", tone)} /> : null}
        <span className={cn("relative inline-flex h-2 w-2 rounded-full", tone)} />
      </span>
      {label}
    </span>
  );
}

function Tile({ label, value, sub, tone, ok }: { label: string; value: number; sub: string; tone?: "warn" | "bad"; ok: boolean }) {
  return (
    <div className="flex flex-col justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm transition hover:border-white/20 hover:bg-white/[0.06]">
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">{label}</dt>
      <dd>
        <span className={cn("block text-4xl font-semibold leading-none tracking-tight", tone === "bad" ? "text-red-300" : tone === "warn" ? "text-amber-200" : "text-white")}>
          {ok ? <span className="tabular-nums animate-in fade-in slide-in-from-bottom-1 duration-500 motion-reduce:animate-none">{value}</span> : "—"}
        </span>
        <span className="mt-1.5 block text-[11px] text-zinc-400">{sub}</span>
      </dd>
    </div>
  );
}

const FLEET_ORDER: AgentView["health"][] = ["failed", "missed", "degraded", "ok", "unchanged", "none", "paused"];

function Fleet({ agents }: { agents: AgentView[] }) {
  const runners = agents.filter((a) => a.health !== "group").sort((a, b) => FLEET_ORDER.indexOf(a.health) - FLEET_ORDER.indexOf(b.health));
  const count = (...h: AgentView["health"][]) => runners.filter((a) => h.includes(a.health)).length;
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur-sm col-span-2 lg:col-span-1">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-400">Fleet</p>
      <ul className="mt-2.5 grid grid-cols-9 gap-1.5" aria-label="Every agent by health">
        {runners.map((a) => (
          <li key={a.agent.id}>
            <Link
              href={agentHref(a.agent.id)}
              scroll={false}
              title={`${a.agent.name} · ${HEALTH[a.health].label}`}
              className={cn("block h-3.5 w-3.5 rounded-[5px] ring-1 ring-white/10 transition hover:scale-125", HEALTH[a.health].dot, a.health === "none" && "bg-white/15", a.health === "paused" && "bg-transparent ring-white/25")}
            >
              <span className="sr-only">{a.agent.name}: {HEALTH[a.health].label}</span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400">
        <span><span className="text-emerald-300">{count("ok", "unchanged")}</span> fine</span>
        <span><span className="text-amber-200">{count("degraded")}</span> degraded</span>
        <span><span className="text-red-300">{count("failed", "missed")}</span> failed or missed</span>
        <span>{count("none", "paused")} waiting</span>
      </p>
    </div>
  );
}

function summary(o: Overview): string {
  const parts: string[] = [];
  if (o.stats.decisions) parts.push(`${o.stats.decisions} decision${o.stats.decisions === 1 ? "" : "s"} wait on you${o.stats.overdue ? `, ${o.stats.overdue} past their date` : ""}`);
  if (o.stats.urgentAlerts) parts.push(`${o.stats.urgentAlerts} urgent alert${o.stats.urgentAlerts === 1 ? "" : "s"}`);
  const broken = o.agents.filter((a) => a.health === "failed" || a.health === "missed").length;
  if (broken) parts.push(`${broken} agent${broken === 1 ? "" : "s"} failed or missed a run`);
  return parts.length ? `${parts.join(". ")}.` : "Nothing waits on you right now.";
}

export function Hero({ overview, outputs, teams }: { overview: Overview; outputs: Outputs; teams: number }) {
  const s = overview.stats;
  const ok = outputs.state === "ok";
  return (
    <section aria-labelledby="company-title" className="relative isolate overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 p-5 text-zinc-50 shadow-2xl shadow-emerald-950/20 md:p-7">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,#fff_1px,transparent_1px),linear-gradient(to_bottom,#fff_1px,transparent_1px)] [background-size:32px_32px] [mask-image:radial-gradient(ellipse_at_top_right,#000,transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-32 -z-10 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-40 left-1/4 -z-10 h-80 w-[36rem] rounded-full bg-violet-500/15 blur-3xl" />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-emerald-300/80">Mpillow · agent harness</p>
          <h1 id="company-title" className="text-3xl font-semibold tracking-tight md:text-[2.6rem] md:leading-tight">Company</h1>
          <p className="text-sm text-zinc-400">
            {s.total} agents in {teams} teams report through Agent 0 to Ivan.{" "}
            {ok ? <span className="text-zinc-200">{summary(overview)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourcePill outputs={outputs} />
          <Link
            href={AGENTS_FOLDER_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/15 bg-white/5 px-3 text-xs font-medium text-zinc-100 transition hover:bg-white/10"
          >
            <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Drive folder
          </Link>
          <RefreshButton />
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(0,1.35fr)]">
        <Tile ok label="Agents live" value={s.live} sub={`of ${s.total} · ${s.total - s.live} paused or waiting`} />
        <Tile ok={ok} label="Reports · 7 days" value={s.reportsThisWeek} sub="Filed in Drive" />
        <Tile ok={ok} label="Decisions" value={s.decisions} sub={s.overdue ? `${s.overdue} past their date` : "None overdue"} tone={s.overdue ? "warn" : undefined} />
        <Tile ok={ok} label="Urgent alerts" value={s.urgentAlerts} sub="Critical or high" tone={s.urgentAlerts ? "bad" : undefined} />
        <Fleet agents={overview.agents} />
      </dl>
    </section>
  );
}
