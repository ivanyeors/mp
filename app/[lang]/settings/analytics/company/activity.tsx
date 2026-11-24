import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Lane, Outcome, Team, TeamDay } from "@/lib/company/insights";
import type { Overview } from "@/lib/company/overview";
import { reportTone } from "@/lib/company/report";
import { cn } from "@/lib/utils";
import { Empty, SectionHead, StatusDot } from "./bits";
import { CARD, CardHead, Donut, OutcomeKey, RunLanes, StackedBars, TeamLegend, outcomeParts, teamParts } from "./charts";
import { agentHref, fmtDay } from "./format";
import { SidePanel } from "./interactive";

function FeedRow({ f, names }: { f: Overview["feed"][number]; names: Map<string, string> }) {
  const tone = f.report ? reportTone(f.report.status) : "unknown";
  return (
    <Link href={agentHref(f.name.agent, f.file.id)} scroll={false} className="flex items-center gap-3 rounded-xl px-2.5 py-2 transition hover:bg-muted/60">
      <StatusDot health={tone === "unknown" ? "none" : tone} />
      <span className="w-12 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{fmtDay(f.name.date)}</span>
      <span className="min-w-0 flex-1 truncate text-[13px]">
        <span className="font-medium">{names.get(f.name.agent) ?? f.name.agent}</span>
        {f.report?.headline ? <span className="text-muted-foreground"> · {f.report.headline}</span> : null}
      </span>
    </Link>
  );
}

const FEED_TOP = 10;

type Charts = { days: TeamDay[]; teams: Team[]; lanes: Lane[]; outcomes: Record<Outcome, number>; now: Date };

export function Activity({ feed, names, charts }: { feed: Overview["feed"]; names: Map<string, string>; charts: Charts }) {
  const totals = new Map(charts.teams.map((t) => [t.id, charts.days.reduce((s, d) => s + (d.byTeam[t.id] ?? 0), 0)]));
  const filed = charts.days.reduce((s, d) => s + d.total, 0);
  const runs = Object.values(charts.outcomes).reduce((s, n) => s + n, 0);
  const clean = charts.outcomes.ok + charts.outcomes.unchanged + charts.outcomes.filed;
  return (
    <section aria-labelledby="activity-title" className="space-y-4">
      <SectionHead id="activity-title" eyebrow="Activity" title="What the agents filed" />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
        <div className={cn(CARD, "lg:col-span-8")}>
          <CardHead
            title={`Reports filed · ${charts.days.length} days`}
            note={`${filed} report${filed === 1 ? "" : "s"}, stacked by team. Hover a day for the split.`}
            right={<TeamLegend teams={charts.teams} />}
          />
          <StackedBars days={charts.days} teams={charts.teams} />
        </div>
        <div className={cn(CARD, "lg:col-span-4")}>
          <CardHead title="Share by team" note={`Last ${charts.days.length} days`} />
          <div className="mt-5">
            <Donut parts={teamParts(charts.teams, totals)} center={String(filed)} sub="reports" />
          </div>
        </div>
        <div className={cn(CARD, "lg:col-span-8")}>
          <CardHead title="Every scheduled run · 8 weeks" note="One row per agent. A dot is a run that was due; a ring is one that never filed." right={<OutcomeKey />} />
          <RunLanes lanes={charts.lanes} teams={charts.teams} now={charts.now} />
        </div>
        <div className="flex flex-col gap-3 lg:col-span-4">
          <div className={CARD}>
            <CardHead title="Run outcomes" note={runs ? `${Math.round((clean / runs) * 100)}% clean over 8 weeks` : "No runs due yet"} />
            <div className="mt-5">
              <Donut parts={outcomeParts(charts.outcomes)} center={String(runs)} sub="runs due" />
            </div>
          </div>
          <div className={cn(CARD, "flex flex-1 flex-col p-2 md:p-2")}>
            <p className="px-2.5 pb-1 pt-2 text-[15px] font-medium tracking-tight text-zinc-100">Latest reports</p>
            {feed.length === 0 ? (
              <Empty>No reports in Drive yet.</Empty>
            ) : (
              <>
                <ol className="flex-1 space-y-0.5">
                  {feed.slice(0, FEED_TOP).map((f) => (
                    <li key={f.file.id}><FeedRow f={f} names={names} /></li>
                  ))}
                </ol>
                {feed.length > FEED_TOP ? (
                  <SidePanel
                    title="Latest reports"
                    description="Newest first, across every agent. Open one to read it."
                    trigger={
                      <button type="button" className="m-1 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs font-medium text-zinc-200 transition hover:bg-white/5">
                        See all {feed.length} <ArrowRight className="h-3 w-3" aria-hidden="true" />
                      </button>
                    }
                  >
                    <ol className="space-y-0.5">
                      {feed.map((f) => (
                        <li key={f.file.id}><FeedRow f={f} names={names} /></li>
                      ))}
                    </ol>
                  </SidePanel>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
