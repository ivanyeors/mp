import Link from "next/link";
import { ArrowRight, CalendarClock, FileText, Siren, Vote } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import type { AlertView, DecisionView, DraftView, Health } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { LABEL, PANEL, Pill, SectionHead } from "./bits";
import { AgentFace } from "./faces";
import { SEVERITY, agentHref, fmtDay } from "./format";
import { Peek, SidePanel } from "./interactive";

type Who = { names: Map<string, string>; health: Map<string, Health> };

const TOP = 3;

function Line({ agent, who, children, end, tone }: { agent: string; who: Who; children: React.ReactNode; end?: React.ReactNode; tone?: "warn" }) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        tone === "warn" && "bg-amber-50/70 dark:bg-amber-950/25",
      )}
    >
      <AgentFace id={agent} health={who.health.get(agent) ?? "none"} size="sm" />
      <span className="min-w-0 flex-1 truncate text-[13px]">{children}</span>
      {end}
    </button>
  );
}

function Detail({ agent, who, children, date }: { agent: string; who: Who; children: React.ReactNode; date: string }) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <AgentFace id={agent} health={who.health.get(agent) ?? "none"} size="sm" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">{who.names.get(agent) ?? agent}</span>
        <span className="font-mono text-[10.5px] text-muted-foreground">{fmtDay(date)}</span>
      </div>
      {children}
      <Link href={agentHref(agent)} scroll={false} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        Open the report <ArrowRight className="h-3 w-3" aria-hidden="true" />
      </Link>
    </div>
  );
}

function DecisionBody({ d }: { d: DecisionView }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium leading-5">{d.question}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {(["options", "recommend", "why", "impact", "reversible", "decide by", "draft"] as const).map((k) =>
          d.fields[k] ? (
            <div key={k} className="contents">
              <dt className="capitalize text-muted-foreground">{k}</dt>
              <dd className={k === "recommend" ? "font-semibold" : undefined}>{d.fields[k]}</dd>
            </div>
          ) : null,
        )}
      </dl>
    </div>
  );
}

function DueChip({ d }: { d: DecisionView }) {
  if (!d.decideBy) return null;
  return (
    <Pill className={cn("shrink-0", d.overdue ? "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100" : "bg-muted text-muted-foreground")}>
      {d.overdue ? "Overdue" : fmtDay(d.decideBy)}
    </Pill>
  );
}

function Tile({
  icon,
  title,
  count,
  sub,
  subTone,
  children,
  all,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  sub: string;
  subTone?: "warn" | "bad";
  children: React.ReactNode;
  all: React.ReactNode;
}) {
  return (
    <div className={cn(PANEL, "flex min-w-0 flex-col p-4")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className={cn(LABEL, "flex items-center gap-1.5")}>
            {icon}
            {title}
          </p>
          <p className="mt-2 text-4xl font-semibold leading-none tracking-tight tabular-nums">{count}</p>
          <p className={cn("mt-1 text-xs", subTone === "bad" ? "text-red-600 dark:text-red-400" : subTone === "warn" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground")}>{sub}</p>
        </div>
      </div>
      <div className="mt-3 flex-1 space-y-0.5">{children}</div>
      {all}
    </div>
  );
}

function SeeAll({ count, title, description, children }: { count: number; title: string; description: string; children: React.ReactNode }) {
  if (count <= TOP) return null;
  return (
    <SidePanel
      title={title}
      description={description}
      trigger={
        <button type="button" className="mt-2 inline-flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs font-medium text-primary transition hover:bg-muted">
          See all {count} <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </button>
      }
    >
      {children}
    </SidePanel>
  );
}

export function NeedsYou({ decisions, alerts, drafts, who }: { decisions: DecisionView[]; alerts: AlertView[]; drafts: DraftView[]; who: Who }) {
  const overdue = decisions.filter((d) => d.overdue).length;
  const urgent = alerts.filter((a) => a.severity === "critical" || a.severity === "high").length;
  const decisionPeek = (d: DecisionView, i: number) => (
    <Peek key={`${d.agent}-${i}`} trigger={<Line agent={d.agent} who={who} end={<DueChip d={d} />} tone={d.overdue ? "warn" : undefined}>{d.question}</Line>}>
      <Detail agent={d.agent} who={who} date={d.date}>
        <DecisionBody d={d} />
      </Detail>
    </Peek>
  );
  const alertPeek = (a: AlertView, i: number) => (
    <Peek key={`${a.agent}-${i}`} trigger={<Line agent={a.agent} who={who} end={<Pill className={cn("shrink-0 capitalize", SEVERITY[a.severity ?? "low"])}>{a.severity ?? "note"}</Pill>}>{a.text}</Line>}>
      <Detail agent={a.agent} who={who} date={a.date}>
        <p className="text-sm leading-5">{a.text}</p>
        {a.deadline ? (
          <p className="flex items-center gap-1.5 text-xs font-medium">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Deadline {a.deadline}
          </p>
        ) : null}
      </Detail>
    </Peek>
  );
  const draftPeek = (d: DraftView, i: number) => (
    <Peek key={`${d.agent}-${i}`} trigger={<Line agent={d.agent} who={who}>{d.text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")}</Line>}>
      <Detail agent={d.agent} who={who} date={d.date}>
        <Markdown className="text-xs [&_p]:my-0">{d.text}</Markdown>
      </Detail>
    </Peek>
  );
  return (
    <section aria-labelledby="needs-title" className="space-y-4">
      <SectionHead id="needs-title" eyebrow="Needs you" title="Waiting on you" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Tile
          icon={<Vote className="h-3 w-3" aria-hidden="true" />}
          title="Decisions"
          count={decisions.length}
          sub={overdue ? `${overdue} past the date asked` : decisions.length ? "None overdue" : "Nothing to decide"}
          subTone={overdue ? "warn" : undefined}
          all={<SeeAll count={decisions.length} title="Decisions" description="Overdue first, then by the date each agent asked for.">{<div className="space-y-1">{decisions.map(decisionPeek)}</div>}</SeeAll>}
        >
          {decisions.slice(0, TOP).map(decisionPeek)}
        </Tile>
        <Tile
          icon={<Siren className="h-3 w-3" aria-hidden="true" />}
          title="Alerts"
          count={alerts.length}
          sub={urgent ? `${urgent} critical or high` : alerts.length ? "None urgent" : "All clear"}
          subTone={urgent ? "bad" : undefined}
          all={<SeeAll count={alerts.length} title="Alerts" description="From each agent's newest report, most severe first.">{<div className="space-y-1">{alerts.map(alertPeek)}</div>}</SeeAll>}
        >
          {alerts.slice(0, TOP).map(alertPeek)}
        </Tile>
        <Tile
          icon={<FileText className="h-3 w-3" aria-hidden="true" />}
          title="Drafts to approve"
          count={drafts.length}
          sub={drafts.length ? "Nothing is sent until you approve" : "No drafts waiting"}
          all={<SeeAll count={drafts.length} title="Drafts awaiting approval" description="Emails, documents and files the agents prepared. Nothing is sent until you approve it.">{<div className="space-y-1">{drafts.map(draftPeek)}</div>}</SeeAll>}
        >
          {drafts.slice(0, TOP).map(draftPeek)}
        </Tile>
      </div>
    </section>
  );
}
