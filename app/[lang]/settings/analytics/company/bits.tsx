import type { ReactNode } from "react";
import type { Beat, Health } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { HEALTH, fmtDay } from "./format";

export const PANEL = "rounded-2xl border bg-card/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/70";
export const LABEL = "font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground";

export function StatusDot({ health, className }: { health: Health; className?: string }) {
  const h = HEALTH[health];
  return (
    <span className={cn("relative inline-flex h-2.5 w-2.5 shrink-0", className)} title={h.label}>
      {h.pulse ? <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:hidden", h.dot)} /> : null}
      <span className={cn("relative inline-flex h-2.5 w-2.5 rounded-full", h.dot)} />
      <span className="sr-only">{h.label}</span>
    </span>
  );
}

const BEAT_TONE: Record<string, string> = {
  ok: "h-3 bg-emerald-500",
  unchanged: "h-3 bg-sky-500",
  degraded: "h-4 bg-amber-500",
  failed: "h-5 bg-red-500",
  unknown: "h-3 bg-foreground/45",
};

export function Heartbeat({ beats, className, big = false }: { beats: Beat[]; className?: string; big?: boolean }) {
  if (beats.length === 0) return null;
  const filed = beats.filter((b) => b.state === "filed").length;
  const missed = beats.filter((b) => b.state === "missed").length;
  const label = `Last ${beats.length} scheduled runs: ${filed} filed a report${missed ? `, ${missed} missed` : ""}`;
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex h-5 items-end gap-[3px]", big && "h-7 gap-1", className)}>
      {beats.map((b) => (
        <i
          key={b.due}
          title={`${fmtDay(b.due.slice(0, 10))} · ${b.state === "filed" ? (b.tone ?? "filed") : b.state === "missed" ? "missed" : "not running yet"}`}
          className={cn(
            "block rounded-full",
            big ? "w-1.5" : "w-1",
            b.state === "filed" ? BEAT_TONE[b.tone ?? "unknown"] : b.state === "missed" ? "h-1.5 bg-red-500/70" : "h-1.5 bg-border",
            big && b.state === "filed" && "scale-y-125 origin-bottom",
          )}
        />
      ))}
    </span>
  );
}

export function Ring({ value, total, className }: { value: number; total: number; className?: string }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const share = total ? value / total : 0;
  return (
    <svg viewBox="0 0 44 44" className={cn("h-11 w-11 -rotate-90", className)} role="img" aria-label={`${value} of ${total} on track`}>
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * share} ${c}`} className="stroke-emerald-500 transition-[stroke-dasharray] duration-700" />
    </svg>
  );
}

export function SectionHead({ eyebrow, title, note, id, action }: { eyebrow: string; title: string; note?: ReactNode; id: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="space-y-1">
        <p className={LABEL}>{eyebrow}</p>
        <h2 id={id} className="text-xl font-semibold tracking-tight">{title}</h2>
        {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", className)}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{children}</p>;
}
