import Link from "next/link";
import { ArrowUpRight, Crown, FileStack, FolderGit2 } from "lucide-react";
import { AGENTS_FOLDER_URL } from "@/lib/company/drive";
import type { AgentView, CopyState } from "@/lib/company/overview";
import type { AgentNode } from "@/lib/company/roster";
import { cn } from "@/lib/utils";
import { Heartbeat, LABEL } from "./bits";
import { AgentFace } from "./faces";
import { HEALTH, agentHref, fmtDay, fmtWhen } from "./format";
import { OrgFocus, Spotlight } from "./interactive";

export type Flags = { attention: Set<string>; quiet: Set<string> };

const FINE = new Set(["ok", "unchanged"]);

function meta(view: AgentView): string {
  if (view.agent.status === "Paused") return "Paused";
  if (view.latest) return FINE.has(view.health) ? fmtDay(view.latest.name.date) : `${fmtDay(view.latest.name.date)} · ${HEALTH[view.health].label}`;
  if (view.nextRun) return `First run ${fmtDay(view.nextRun.slice(0, 10))}`;
  return HEALTH[view.health].label;
}

function focusClasses(id: string, flags: Flags): string {
  return cn(
    "transition-opacity duration-300",
    !flags.attention.has(id) && "group-data-[focus=attention]/org:opacity-25",
    !flags.quiet.has(id) && "group-data-[focus=quiet]/org:opacity-25",
  );
}

function AgentRow({ view, selected, flags, lead = false }: { view: AgentView; selected: boolean; flags: Flags; lead?: boolean }) {
  return (
    <Link
      href={agentHref(view.agent.id)}
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group/row flex items-center gap-2.5 rounded-xl border border-transparent p-2 transition hover:border-border hover:bg-background/80 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        lead && "border-border/70 bg-background/60",
        selected && "border-primary/40 bg-background shadow-sm ring-2 ring-primary/10",
        focusClasses(view.agent.id, flags),
      )}
    >
      <AgentFace id={view.agent.id} health={view.health} size={lead ? "md" : "sm"} />
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate text-[13px] leading-5", lead ? "font-semibold" : "font-medium")}>{view.agent.name}</span>
        <span className={cn("block truncate text-[11px] leading-4", HEALTH[view.health].text)}>{meta(view)}</span>
      </span>
      <Heartbeat beats={view.beats.slice(-8)} className="hidden shrink-0 opacity-80 group-hover/row:opacity-100 sm:inline-flex 2xl:hidden" />
    </Link>
  );
}

function Branch({ node, views, selected, flags }: { node: AgentNode; views: Map<string, AgentView>; selected: string | null; flags: Flags }) {
  const view = views.get(node.id)!;
  const crew = node.children.map((c) => views.get(c.id)!);
  const needs = crew.filter((c) => flags.attention.has(c.agent.id)).length + (node.kind === "dept" ? 0 : Number(flags.attention.has(node.id)));
  return (
    <Spotlight className="h-full rounded-2xl border bg-card/80 p-3 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="truncate text-sm font-semibold leading-5">{node.kind === "dept" ? node.name : node.name.replace(/ Lead$/, "")}</p>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
          {needs ? (
            <span title={`${needs} need you`} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              {needs}
              <span className="sr-only"> need you</span>
            </span>
          ) : null}
          {crew.length + (node.kind === "dept" ? 0 : 1)}
          <span className="sr-only"> agents</span>
        </span>
      </div>
      {node.kind !== "dept" ? (
        <div className="mb-1.5">
          <AgentRow view={view} selected={selected === node.id} flags={flags} lead />
        </div>
      ) : null}
      <ul className={cn("space-y-0.5", node.kind !== "dept" && "ml-3 border-l border-dashed pl-1.5")}>
        {crew.map((c) => (
          <li key={c.agent.id}>
            <AgentRow view={c} selected={selected === c.agent.id} flags={flags} />
          </li>
        ))}
      </ul>
    </Spotlight>
  );
}

function SystemCard({ icon, title, value, href, warn, hint }: { icon: React.ReactNode; title: string; value: string; href?: string; warn?: string; hint: string }) {
  const body = (
    <>
      <span className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground/80">{icon}</span>
      <span className="min-w-0">
        <span className={cn(LABEL, "block")}>{title}</span>
        <span className="block text-sm font-semibold leading-5">{value}</span>
      </span>
      {warn ? <span className="ml-auto shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">{warn}</span> : null}
      {href ? <ArrowUpRight className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground", !warn && "ml-auto")} aria-hidden="true" /> : null}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-2xl border bg-card/80 p-3 text-left shadow-sm transition hover:border-foreground/20";
  return href ? (
    <a href={href} target="_blank" rel="noopener noreferrer" title={hint} className={cls}>{body}</a>
  ) : (
    <div title={hint} className={cls}>{body}</div>
  );
}

export function OrgChart({
  root,
  views,
  selected,
  flags,
  outputCount,
  copies,
  driveOk,
}: {
  root: AgentNode;
  views: Map<string, AgentView>;
  selected: string | null;
  flags: Flags;
  outputCount: number;
  copies: CopyState[];
  driveOk: boolean;
}) {
  const ceo = views.get(root.id)!;
  const runners = [...views.values()].filter((v) => v.agent.kind !== "dept");
  const same = copies.filter((c) => c.state === "same").length;
  return (
    <section aria-labelledby="org-title" className="space-y-4">
      <OrgFocus
        counts={{ all: runners.length, attention: flags.attention.size, quiet: flags.quiet.size }}
        head={
          <div className="space-y-1">
            <p className={LABEL}>Org chart</p>
            <h2 id="org-title" className="text-xl font-semibold tracking-tight">Who reports to whom</h2>
          </div>
        }
      >

        <div className="relative overflow-hidden rounded-3xl border bg-gradient-to-b from-muted/50 via-background to-background p-4 md:p-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-64 opacity-60 [background:radial-gradient(60%_100%_at_50%_0%,rgb(16_185_129/0.10),transparent)]" />

          <div className="relative flex flex-col items-start lg:items-center">
            <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm">
              <Crown className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
              <span className="font-medium">Ivan</span>
              <span className="text-xs text-muted-foreground">Founder</span>
            </div>
            <span aria-hidden="true" className="ml-6 h-5 w-px bg-border lg:ml-0" />

            <div className="grid w-full items-center gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]">
              <div className="order-2 lg:order-1">
                <SystemCard icon={<FileStack className="h-4 w-4" aria-hidden="true" />} title="Outputs in Drive" value={`${outputCount} files`} hint="Reports, drafts and trackers in Drive, folder Agents" href={AGENTS_FOLDER_URL} />
              </div>
              <Link
                href={agentHref(root.id)}
                scroll={false}
                className={cn("order-1 block rounded-[22px] bg-gradient-to-r from-emerald-400/70 via-sky-400/60 to-violet-400/70 p-px shadow-lg shadow-sky-500/10 transition hover:shadow-sky-500/25 lg:order-2", focusClasses(root.id, flags))}
              >
                <span className="flex items-start gap-3 rounded-[21px] bg-background p-4">
                  <AgentFace id={root.id} health={ceo.health} size="lg" />
                  <span className="min-w-0 flex-1">
                    <span className={cn(LABEL, "block")}>Chief of staff</span>
                    <span className="block text-base font-semibold leading-6">{ceo.agent.name}</span>
                    <span className={cn("block text-xs", HEALTH[ceo.health].text)}>{meta(ceo)}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <Heartbeat beats={ceo.beats} />
                      {ceo.nextRun ? <span>Next {fmtWhen(ceo.nextRun)}</span> : null}
                    </span>
                  </span>
                </span>
              </Link>
              <div className="order-3">
                <SystemCard
                  icon={<FolderGit2 className="h-4 w-4" aria-hidden="true" />}
                  title="Instructions"
                  value={`${copies.length} files`}
                  hint={!driveOk ? "company/ in the code. Checking the Drive copy needs Drive." : same === copies.length ? "company/ in the code. The Drive copy matches." : "company/ in the code. Run the company-sync skill to update the Drive copy."}
                  warn={!driveOk || same === copies.length ? undefined : same === 0 ? "Not in Drive" : `${copies.length - same} out of date`}
                />
              </div>
            </div>
            <span aria-hidden="true" className="ml-6 hidden h-6 w-px bg-border lg:ml-0 lg:block" />
          </div>

          <ol className="relative mt-3 grid gap-3 border-l pl-4 lg:mt-0 lg:grid-cols-3 lg:border-l-0 lg:pl-0 2xl:flex 2xl:pt-6">
            <span aria-hidden="true" className="absolute left-[8.33%] right-[8.33%] top-0 hidden h-px bg-gradient-to-r from-border via-foreground/20 to-border 2xl:block" />
            {root.children.map((branch, i) => (
              <li
                key={branch.id}
                style={{ animationDelay: `${i * 60}ms` }}
                className="relative min-w-0 animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both duration-500 before:absolute before:-left-4 before:top-7 before:h-px before:w-4 before:bg-border motion-reduce:animate-none lg:before:hidden 2xl:flex-1 2xl:before:block 2xl:before:-top-6 2xl:before:left-1/2 2xl:before:h-6 2xl:before:w-px"
              >
                <Branch node={branch} views={views} selected={selected} flags={flags} />
              </li>
            ))}
          </ol>
        </div>
      </OrgFocus>
    </section>
  );
}
