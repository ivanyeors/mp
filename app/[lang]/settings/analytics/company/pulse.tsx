import type { NetEdge, NetNode, Ratio } from "@/lib/company/insights";
import type { AgentView } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { CARD, CardHead, HatchedBars, NetworkGraph } from "./charts";
import { HEALTH, fmtWhen } from "./format";

const KEY = [
  { label: "OK", dot: HEALTH.ok.dot },
  { label: "No change", dot: HEALTH.unchanged.dot },
  { label: "Degraded", dot: HEALTH.degraded.dot },
  { label: "Failed or missed", dot: HEALTH.failed.dot },
  { label: "No report yet", dot: "bg-muted-foreground/30 ring-1 ring-border" },
];

export function Pulse({ net, views, reports, hot, ratios }: { net: { nodes: NetNode[]; edges: NetEdge[] }; views: AgentView[]; reports: Map<string, number>; hot: Set<string>; ratios: Ratio[] }) {
  const runners = views.filter((v) => v.agent.kind !== "dept");
  const count = (...h: AgentView["health"][]) => runners.filter((v) => h.includes(v.health)).length;
  const next = runners.filter((v) => v.nextRun).sort((a, b) => a.nextRun!.localeCompare(b.nextRun!))[0] ?? null;
  const byId = new Map(views.map((v) => [v.agent.id, v]));
  return (
    <section aria-label="Fleet pulse" className="grid grid-cols-1 gap-3 lg:grid-cols-12">
      <div className={cn(CARD, "lg:col-span-7")}>
        <CardHead title="Agent network" note="Agent 0 in the middle, its six teams around it. Dot size is reports in 30 days. Hover to pause and name a dot." />
        <div className="mt-3">
          <NetworkGraph nodes={net.nodes} edges={net.edges} views={byId} reports={reports} hot={hot} />
        </div>
        <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {KEY.map((k) => (
            <li key={k.label} className="inline-flex items-center gap-1.5">
              <span className={cn("h-2 w-2 rounded-full", k.dot)} aria-hidden="true" />
              {k.label}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full ring-1 ring-red-500/70 shadow-[0_0_8px_rgb(248_113_113/0.6)]" aria-hidden="true" />
            Needs you
          </li>
        </ul>
      </div>
      <div className={cn(CARD, "flex flex-col lg:col-span-5")}>
        <CardHead title="Fleet" note="How the harness is holding up" />
        <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-2">
          <p className="text-6xl font-light leading-none tracking-tight tabular-nums text-foreground">{runners.length - count("paused", "none")}</p>
          <div className="flex flex-wrap gap-1.5 pb-1 text-[11px]">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-foreground/80"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{count("ok", "unchanged")} fine</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-foreground/80"><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />{count("degraded")} degraded</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-foreground/80"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{count("failed", "missed")} failed or missed</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">agents have filed at least once · {count("none", "paused")} still waiting on a first run</p>
        <div className="my-5 h-px bg-border" />
        <HatchedBars ratios={ratios} />
        {next ? (
          <p className="mt-auto border-t border-border pt-4 text-center text-[11px] text-muted-foreground">
            Next run · <span className="text-foreground/80">{next.agent.name}</span> · {fmtWhen(next.nextRun!)}
          </p>
        ) : null}
      </div>
    </section>
  );
}
