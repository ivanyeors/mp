import Link from "next/link";
import type { ReactNode } from "react";
import type { Lane, NetEdge, NetNode, Outcome, Ratio, Team, TeamDay } from "@/lib/company/insights";
import type { AgentView } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { AgentFace } from "./faces";
import { HEALTH, agentHref, fmtDay } from "./format";

export const CARD = "relative overflow-hidden rounded-[22px] border border-border bg-card p-4 shadow-sm md:p-5";
export const EYEBROW = "text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground";

export function CardHead({ title, note, right }: { title: string; note?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-tight text-foreground">{title}</h3>
        {note ? <p className="mt-0.5 text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {right}
    </div>
  );
}

export const TEAM_SHADE = ["bg-foreground", "bg-foreground/75", "bg-foreground/55", "bg-foreground/40", "bg-foreground/28", "bg-foreground/16"];
const TEAM_STROKE = ["stroke-foreground", "stroke-foreground/75", "stroke-foreground/55", "stroke-foreground/40", "stroke-foreground/28", "stroke-foreground/16"];

const OUTCOME: Record<Outcome, { label: string; fill: string; stroke: string }> = {
  ok: { label: "OK", fill: "bg-emerald-500", stroke: "stroke-emerald-500" },
  unchanged: { label: "No change", fill: "bg-sky-500", stroke: "stroke-sky-500" },
  filed: { label: "Filed, not read", fill: "bg-muted-foreground/50", stroke: "stroke-muted-foreground/50" },
  degraded: { label: "Degraded", fill: "bg-amber-500", stroke: "stroke-amber-500" },
  failed: { label: "Failed", fill: "bg-red-500", stroke: "stroke-red-500" },
  missed: { label: "Missed", fill: "bg-transparent ring-[1.5px] ring-inset ring-red-500", stroke: "stroke-red-500/60" },
};

const SPIN = "animate-[spin_220s_linear_infinite] motion-reduce:animate-none group-hover/net:[animation-play-state:paused] group-focus-within/net:[animation-play-state:paused]";
const UNSPIN = "animate-[spin_220s_linear_infinite_reverse] motion-reduce:animate-none group-hover/net:[animation-play-state:paused] group-focus-within/net:[animation-play-state:paused]";
const pos = (v: number) => `${((v + 1.08) / 2.16) * 100}%`;

export function NetworkGraph({ nodes, edges, views, reports, hot }: { nodes: NetNode[]; edges: NetEdge[]; views: Map<string, AgentView>; reports: Map<string, number>; hot: Set<string> }) {
  const at = new Map(nodes.map((n) => [n.id, n]));
  const peak = Math.max(1, ...reports.values());
  return (
    <div className="group/net relative mx-auto aspect-square w-full max-w-[clamp(460px,30cqi,620px)]">
      <div aria-hidden="true" className="pointer-events-none absolute inset-[18%] rounded-full bg-[radial-gradient(circle,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_70%)]" />
      <div className={cn("absolute inset-0", SPIN)}>
        <svg viewBox="-1.08 -1.08 2.16 2.16" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <circle r="0.52" fill="none" className="stroke-border" strokeWidth="0.004" strokeDasharray="0.012 0.018" />
          <circle r="0.9" fill="none" className="stroke-border" strokeWidth="0.004" strokeDasharray="0.012 0.018" />
          {edges.map((e) => {
            const a = at.get(e.from);
            const b = at.get(e.to);
            if (!a || !b) return null;
            return <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={hot.has(e.to) ? 0.007 : 0.005} className={hot.has(e.to) ? "stroke-red-500/45" : "stroke-foreground/20"} />;
          })}
        </svg>
        <ul>
          {nodes.map((n) => {
            const view = views.get(n.id);
            const health = view?.health ?? "none";
            const count = reports.get(n.id) ?? 0;
            const size = n.ring === 0 ? 46 : n.ring === 1 ? 30 : Math.round(9 + 11 * Math.sqrt(count / peak));
            return (
              <li key={n.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: pos(n.x), top: pos(n.y) }}>
                <div className={UNSPIN}>
                  <Link
                    href={agentHref(n.id)}
                    scroll={false}
                    className="group/node relative grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ width: Math.max(size, 22), height: Math.max(size, 22) }}
                  >
                    {n.ring === 2 ? (
                      <span className={cn("relative block rounded-full transition group-hover/node:scale-125", health === "none" || health === "paused" ? "bg-muted-foreground/30 ring-1 ring-border" : HEALTH[health].dot, hot.has(n.id) && "shadow-[0_0_14px_2px_rgb(248_113_113/0.55)]")} style={{ width: size, height: size }}>
                        {hot.has(n.id) ? <span className="absolute inset-[-5px] rounded-full ring-1 ring-red-400/60" /> : null}
                      </span>
                    ) : n.ring === 1 ? (
                      <AgentFace id={n.id} health="group" size="sm" />
                    ) : (
                      <span className="grid h-[46px] w-[46px] place-items-center rounded-full bg-background shadow-[0_0_40px_6px_color-mix(in_oklch,var(--foreground)_14%,transparent)] ring-1 ring-foreground/40">
                        <AgentFace id={n.id} health={health} size="sm" />
                      </span>
                    )}
                    {n.ring === 1 ? (
                      <span className="pointer-events-none absolute left-1/2 top-full mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-full bg-background/85 px-1.5 py-px text-[10px] text-muted-foreground ring-1 ring-border sm:block">{n.name.replace(/ Lead$/, "")}</span>
                    ) : null}
                    <span className={cn("pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-border bg-popover/95 px-2 py-0.5 text-[11px] text-popover-foreground opacity-0 shadow-lg transition group-hover/node:opacity-100 group-focus-visible/node:opacity-100", n.ring === 1 && "sm:hidden")}>
                      {n.name} · {n.ring === 0 ? "Chief of Staff" : n.ring === 1 ? "Team" : `${HEALTH[health].label} · ${count} report${count === 1 ? "" : "s"}`}
                    </span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function HatchedBars({ ratios }: { ratios: Ratio[] }) {
  return (
    <ul className="flex flex-1 flex-col justify-evenly gap-4">
      {ratios.map((r, i) => {
        const share = r.of ? r.done / r.of : 0;
        return (
          <li key={r.label} title={r.note}>
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="text-foreground/80">
                {r.label} <span className="text-muted-foreground">({r.done}/{r.of})</span>
              </span>
              <span className="tabular-nums text-foreground">{r.of ? `${Math.round(share * 100)}%` : "—"}</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                style={{ width: `${share * 100}%`, animationDelay: `${i * 80}ms` }}
                className={cn(
                  "h-full origin-left animate-in fade-in-0 slide-in-from-left-4 fill-mode-both rounded-full duration-700 motion-reduce:animate-none",
                  i === 0
                    ? "[background:repeating-linear-gradient(-45deg,rgb(16_185_129)_0_4px,rgb(16_185_129/0.4)_4px_8px)]"
                    : "[background:repeating-linear-gradient(-45deg,var(--foreground)_0_4px,color-mix(in_oklch,var(--foreground)_30%,transparent)_4px_8px)]",
                )}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function TeamLegend({ teams, totals }: { teams: Team[]; totals?: Map<string, number> }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {teams.map((t, i) => (
        <li key={t.id} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-[3px]", TEAM_SHADE[i % TEAM_SHADE.length])} aria-hidden="true" />
          {t.name}
          {totals ? <span className="tabular-nums text-muted-foreground">{totals.get(t.id) ?? 0}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function StackedBars({ days, teams }: { days: TeamDay[]; teams: Team[] }) {
  const peak = Math.max(1, ...days.map((d) => d.total));
  const ticks = [...new Set([peak, Math.round(peak / 2), 0])];
  return (
    <div className="mt-5 flex gap-2">
      <div className="flex h-48 flex-col justify-between pb-5 text-right text-[10px] tabular-nums text-muted-foreground/70" aria-hidden="true">
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
      <ol className="flex h-48 min-w-0 flex-1 items-end gap-[3px] sm:gap-1" aria-label={`Reports filed each day for the last ${days.length} days`}>
        {days.map((d, i) => {
          const label = i === days.length - 1 ? "Today" : i % 7 === (days.length - 1) % 7 ? fmtDay(d.date) : null;
          return (
            <li key={d.date} className="group/day relative flex h-full min-w-0 flex-1 flex-col items-center justify-end">
              <span className="sr-only">{fmtDay(d.date)}: {d.total} reports</span>
              <div className="flex h-[calc(100%-1.25rem)] w-full max-w-7 flex-col-reverse items-stretch justify-start gap-[2px]" aria-hidden="true">
                {d.total === 0 ? (
                  <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-muted-foreground/25" />
                ) : (
                  teams.map((t, ti) =>
                    d.byTeam[t.id] ? (
                      <span
                        key={t.id}
                        style={{ height: `calc(${(d.byTeam[t.id] / peak) * 100}% - 2px)`, animationDelay: `${i * 18}ms` }}
                        className={cn("block min-h-1.5 origin-bottom animate-in fade-in-0 slide-in-from-bottom-2 fill-mode-both rounded-full duration-500 motion-reduce:animate-none", TEAM_SHADE[ti % TEAM_SHADE.length])}
                      />
                    ) : null,
                  )
                )}
              </div>
              <span className="mt-1.5 h-3.5 whitespace-nowrap text-[9.5px] text-muted-foreground" aria-hidden="true">{label}</span>
              {d.total ? (
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 w-max -translate-x-1/2 rounded-xl border border-border bg-popover/95 px-2.5 py-1.5 text-[11px] text-popover-foreground opacity-0 shadow-lg transition group-hover/day:opacity-100" aria-hidden="true">
                  <span className="block font-medium">{fmtDay(d.date)} · {d.total} report{d.total === 1 ? "" : "s"}</span>
                  {teams.filter((t) => d.byTeam[t.id]).map((t) => (
                    <span key={t.id} className="block text-muted-foreground">{t.name} {d.byTeam[t.id]}</span>
                  ))}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Part = { key: string; label: string; value: number; stroke: string; swatch: string };

export function Donut({ parts, center, sub }: { parts: Part[]; center: string; sub: string }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  const r = 40;
  const c = 2 * Math.PI * r;
  const gap = parts.filter((p) => p.value > 0).length > 1 ? 2.2 : 0;
  let offset = 0;
  return (
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @sm:flex-row @sm:gap-8">
        <div className="relative h-36 w-36 shrink-0">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
            <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-muted" />
            {total > 0
              ? parts.map((p) => {
                  if (!p.value) return null;
                  const len = (p.value / total) * c;
                  const seg = <circle key={p.key} cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeDasharray={`${Math.max(0.5, len - gap)} ${c}`} strokeDashoffset={-offset} className={p.stroke} />;
                  offset += len;
                  return seg;
                })
              : null}
          </svg>
          <div className="absolute inset-0 grid place-items-center text-center">
            <span>
              <span className="block text-2xl font-medium tabular-nums text-foreground">{center}</span>
              <span className="block text-[10px] text-muted-foreground">{sub}</span>
            </span>
          </div>
        </div>
        <table className="w-full text-[12px]">
          <tbody>
            {parts.map((p) => (
              <tr key={p.key} className="text-muted-foreground">
                <td className="py-[3px] pr-2"><span className={cn("mr-2 inline-block h-2 w-2 rounded-[3px] align-middle", p.swatch)} aria-hidden="true" />{p.label}</td>
                <td className="py-[3px] text-right tabular-nums text-foreground/80">{p.value}</td>
                <td className="w-12 py-[3px] text-right tabular-nums text-foreground">{total ? `${((p.value / total) * 100).toFixed(0)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function outcomeParts(counts: Record<Outcome, number>): Part[] {
  return (Object.keys(OUTCOME) as Outcome[]).map((o) => ({ key: o, label: OUTCOME[o].label, value: counts[o], stroke: OUTCOME[o].stroke, swatch: OUTCOME[o].fill }));
}

export function teamParts(teams: Team[], totals: Map<string, number>): Part[] {
  return teams.map((t, i) => ({ key: t.id, label: t.name, value: totals.get(t.id) ?? 0, stroke: TEAM_STROKE[i % TEAM_STROKE.length], swatch: TEAM_SHADE[i % TEAM_SHADE.length] }));
}

const WEEKS = 8;

export function RunLanes({ lanes, teams, now }: { lanes: Lane[]; teams: Team[]; now: Date }) {
  const start = now.getTime() - WEEKS * 7 * 86_400_000;
  const axis = Array.from({ length: WEEKS + 1 }, (_, i) => new Date(start + i * 7 * 86_400_000).toISOString().slice(0, 10));
  const groups = teams.map((t) => ({ team: t, lanes: lanes.filter((l) => l.team === t.id) })).filter((g) => g.lanes.length);
  const top = lanes.filter((l) => !teams.some((t) => t.id === l.team));
  return (
    <div className="mt-4">
      <div className="space-y-2.5">
        {[{ team: null as Team | null, lanes: top }, ...groups].filter((g) => g.lanes.length).map((g) => (
          <div key={g.team?.id ?? "top"}>
            {g.team ? <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">{g.team.name}</p> : null}
            <ul className="space-y-px">
              {g.lanes.map((l) => (
                <li key={l.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
                  <Link href={agentHref(l.id)} scroll={false} className="truncate rounded px-1 text-[11.5px] text-muted-foreground transition hover:bg-muted hover:text-foreground">{l.name}</Link>
                  <div className="relative h-5 rounded-md bg-[repeating-linear-gradient(to_right,var(--border)_0_1px,transparent_1px_12.5%)]">
                    <span className="absolute inset-x-0 top-1/2 h-px bg-border/70" aria-hidden="true" />
                    {l.marks.map((m) => (
                      <span
                        key={m.due}
                        title={`${l.name} · ${fmtDay(m.due.slice(0, 10))} · ${m.outcome === "before" ? "not running yet" : OUTCOME[m.outcome].label}`}
                        style={{ left: `${m.at * 100}%` }}
                        className={cn(
                          "absolute top-1/2 block -translate-x-1/2 -translate-y-1/2 rounded-full",
                          m.outcome === "before" ? "h-1 w-1 bg-muted-foreground/40" : cn("h-2.5 w-2.5", OUTCOME[m.outcome].fill),
                          (m.outcome === "failed" || m.outcome === "degraded") && "shadow-[0_0_10px_1px_currentColor] h-3 w-3",
                          m.outcome === "failed" && "text-red-500",
                          m.outcome === "degraded" && "text-amber-500",
                        )}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[9.5rem_minmax(0,1fr)]" aria-hidden="true">
        <span />
        <div className="relative h-4 text-[9.5px] text-muted-foreground/70">
          {axis.map((d, i) => (
            <span key={d} style={{ left: `${(i / WEEKS) * 100}%` }} className={cn("absolute -translate-x-1/2 whitespace-nowrap", i % 2 === 1 && "hidden sm:inline", i === WEEKS && "-translate-x-full")}>
              {i === WEEKS ? "Today" : fmtDay(d)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OutcomeKey() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      {(["ok", "unchanged", "filed", "degraded", "failed", "missed"] as Outcome[]).map((o) => (
        <li key={o} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-full", OUTCOME[o].fill)} aria-hidden="true" />
          {OUTCOME[o].label}
        </li>
      ))}
    </ul>
  );
}
