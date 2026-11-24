import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { OkrBranch, OkrValue } from "@/lib/company/overview";
import { cn } from "@/lib/utils";
import { PANEL, Pill, Ring, SectionHead } from "./bits";
import { agentHref, okrTone } from "./format";
import { SidePanel } from "./interactive";

function dotTone(status: string | undefined): string {
  const s = (status ?? "").toLowerCase();
  if (s.includes("on track")) return "bg-emerald-500";
  if (s.includes("at risk")) return "bg-amber-500";
  if (s.includes("off track")) return "bg-red-500";
  return "bg-muted-foreground/25";
}

function Details({ branch, values }: { branch: OkrBranch; values: Record<string, OkrValue> }) {
  return (
    <ul className="divide-y">
      {branch.krs.map((kr) => {
        const v = values[kr.id];
        return (
          <li key={kr.id} className="space-y-2 py-3 first:pt-0">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm leading-5">
                <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">{kr.id}</span>
                {kr.text}
              </p>
              <Pill className={cn("shrink-0", okrTone(v?.status))}>{v?.status || "Not measured"}</Pill>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                <p className="text-muted-foreground">Now</p>
                <p className="font-semibold tabular-nums">{v?.current || kr.baseline || "—"}</p>
              </div>
              <div className="rounded-lg bg-muted/60 px-2.5 py-1.5">
                <p className="text-muted-foreground">Target</p>
                <p className="font-semibold tabular-nums">{kr.target || "—"}</p>
              </div>
            </div>
            {v ? <p className="text-[11px] text-muted-foreground">Reported by {v.agent} on {v.date}</p> : null}
            {kr.aligned.length ? (
              <ul className="space-y-1">
                {kr.aligned.map((a) => (
                  <li key={a.id}>
                    <Link href={agentHref(a.owner)} scroll={false} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition hover:bg-muted">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotTone(values[a.id]?.status))} aria-hidden="true" />
                      <span className="font-mono text-muted-foreground">{a.id}</span>
                      <span className="min-w-0 flex-1 truncate">{a.text}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{values[a.id]?.current ?? "—"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-amber-700 dark:text-amber-400">No agent key result feeds this yet.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Okrs({ branches, values }: { branches: OkrBranch[]; values: Record<string, OkrValue> }) {
  return (
    <section aria-labelledby="okrs-title" className="space-y-4">
      <SectionHead id="okrs-title" eyebrow="2027 OKRs" title="Where the company is heading" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 @[120rem]:grid-cols-6">
        {branches.map((branch) => {
          const { okr, krs } = branch;
          const onTrack = krs.filter((k) => /on track/i.test(values[k.id]?.status ?? "")).length;
          const offTrack = krs.filter((k) => /off track/i.test(values[k.id]?.status ?? "")).length;
          return (
            <SidePanel
              key={okr.id}
              title={okr.text}
              description={`${okr.id} · ${krs.length} key results. Values are the newest an agent reported.`}
              trigger={
                <button type="button" className={cn(PANEL, "group flex w-full items-center gap-3 p-3.5 text-left transition hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md motion-reduce:transform-none")}>
                  <span className="relative shrink-0">
                    <Ring value={onTrack} total={krs.length} />
                    <span className="absolute inset-0 grid place-items-center font-mono text-[10px] font-semibold tabular-nums">
                      {onTrack}/{krs.length}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-mono text-[10px] text-muted-foreground">{okr.id}{offTrack ? <span className="text-red-600 dark:text-red-400"> · {offTrack} off track</span> : null}</span>
                    <span className="line-clamp-2 block text-sm font-semibold leading-5">{okr.text}</span>
                    <span className="mt-1.5 flex gap-1" aria-hidden="true">
                      {krs.map((k) => (
                        <span key={k.id} title={`${k.id} · ${values[k.id]?.status ?? "Not measured"}`} className={cn("h-1.5 w-5 rounded-full", dotTone(values[k.id]?.status))} />
                      ))}
                    </span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5" aria-hidden="true" />
                </button>
              }
            >
              <Details branch={branch} values={values} />
            </SidePanel>
          );
        })}
      </div>
    </section>
  );
}
