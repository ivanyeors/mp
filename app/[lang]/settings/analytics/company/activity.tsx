import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ActivityDay, Overview } from "@/lib/company/overview";
import { reportTone } from "@/lib/company/report";
import { cn } from "@/lib/utils";
import { Empty, LABEL, PANEL, SectionHead, StatusDot } from "./bits";
import { agentHref, fmtDay } from "./format";
import { SidePanel } from "./interactive";

const WEEKDAY = new Intl.DateTimeFormat("en-SG", { weekday: "narrow", timeZone: "UTC" });

function Bars({ days }: { days: ActivityDay[] }) {
  const peak = Math.max(0, ...days.map((d) => d.reports));
  const peakIndex = peak > 0 ? days.map((d) => d.reports).lastIndexOf(peak) : -1;
  const total = days.reduce((s, d) => s + d.reports, 0);
  return (
    <div className={cn(PANEL, "flex flex-col p-4 md:p-5")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={LABEL}>Reports filed</p>
          <p className="mt-2 text-4xl font-semibold leading-none tracking-tight tabular-nums">{total}</p>
          <p className="mt-1 text-xs text-muted-foreground">in the last {days.length} days</p>
        </div>
        {peakIndex >= 0 ? (
          <span className="rounded-full border bg-background px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
            Busiest {fmtDay(days[peakIndex].date)} · {peak}
          </span>
        ) : null}
      </div>
      <div className="relative mt-5 flex h-40 items-end gap-1 sm:gap-1.5" role="img" aria-label={`Reports per day over the last ${days.length} days, ${total} in all`}>
        {days.map((d, i) => {
          const lit = i === peakIndex;
          const today = i === days.length - 1;
          const height = peak ? Math.max(6, (d.reports / peak) * 100) : 6;
          return (
            <div key={d.date} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              <span className="pointer-events-none absolute -top-1 z-10 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-1.5 py-0.5 font-mono text-[10px] text-popover-foreground opacity-0 shadow-sm transition group-hover:opacity-100">
                {d.reports} · {fmtDay(d.date)}
              </span>
              <span
                style={{ height: `${height}%`, animationDelay: `${i * 30}ms` }}
                className={cn(
                  "block w-full origin-bottom animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both rounded-t-md border duration-500 motion-reduce:animate-none",
                  lit
                    ? "border-emerald-500/60 bg-emerald-500/15 [background-image:repeating-linear-gradient(45deg,rgb(16_185_129/0.55)_0_1px,transparent_1px_5px)]"
                    : d.reports
                      ? "border-border bg-muted/60 [background-image:repeating-linear-gradient(45deg,var(--border)_0_1px,transparent_1px_5px)]"
                      : "border-dashed border-border bg-transparent",
                  today && !lit && "border-foreground/30",
                )}
              />
              <span className={cn("font-mono text-[9.5px]", today ? "font-semibold text-foreground" : "text-muted-foreground")}>
                {WEEKDAY.format(new Date(`${d.date}T00:00:00Z`))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

const FEED_TOP = 6;

export function Activity({ feed, days, names }: { feed: Overview["feed"]; days: ActivityDay[]; names: Map<string, string> }) {
  return (
    <section aria-labelledby="activity-title" className="space-y-4">
      <SectionHead id="activity-title" eyebrow="Activity" title="What the agents filed" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Bars days={days} />
        <div className={cn(PANEL, "flex flex-col p-2")}>
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
                    <button type="button" className="m-1 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-muted">
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
    </section>
  );
}
