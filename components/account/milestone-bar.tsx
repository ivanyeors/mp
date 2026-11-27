import { Check, ChevronDown } from "lucide-react";
import { milestoneProgress, type MilestoneStep, type PointsMilestone } from "@/lib/points/milestones";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "@/lib/points/value";

const n = (v: number) => v.toLocaleString("en-SG");
const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;
const worth = (points: number) => formatDollarsShort(pointsToDollars(points));

function MilestoneNode({ step, isNext }: { step: MilestoneStep; isNext: boolean }) {
  if (step.reached) {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.55)]">
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  return (
    <span
      className={
        isNext
          ? "size-5 shrink-0 rounded-full border-2 border-blue-500 bg-background ring-4 ring-blue-500/15"
          : "size-5 shrink-0 rounded-full border-2 border-muted bg-background"
      }
    />
  );
}

export function MilestoneBar({
  ladder,
  earned = 0,
  pending = 0,
  preview = false,
}: {
  ladder: readonly PointsMilestone[];
  earned?: number;
  pending?: number;
  preview?: boolean;
}) {
  const p = milestoneProgress(ladder, preview ? 0 : earned, preview ? 0 : pending);
  if (!p.steps.length) return null;
  const cols = { gridTemplateColumns: `repeat(${p.steps.length}, minmax(0, 1fr))` };
  const next = preview ? null : p.next;

  return (
    <details className="group" data-section="points-milestones">
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-5 transition-colors hover:bg-muted/50 active:bg-press sm:p-6 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">{next ? "Next bonus" : "Bonus milestones"}</span>
          <span className="flex items-center gap-2">
            {next ? (
              <span className="font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                +{formatPointsCount(next.bonus)} <span className="font-normal text-muted-foreground">({worth(next.bonus)})</span>
              </span>
            ) : null}
            <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </span>
        </span>
        <span aria-hidden="true" className="flex items-center gap-1">
          {p.steps.map((s) => (
            <span key={s.milestone} className="flex flex-1 items-center gap-1">
              <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                {s.pendingFill > s.fill ? (
                  <span className="mp-points-fill absolute inset-y-0 left-0 rounded-full bg-blue-400/35" style={{ width: pct(s.pendingFill) }} />
                ) : null}
                {s.fill > 0 ? (
                  <span
                    className="mp-points-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                    style={{ width: pct(s.fill) }}
                  />
                ) : null}
              </span>
              <MilestoneNode step={s} isNext={next?.milestone === s.milestone} />
            </span>
          ))}
        </span>
        <span aria-hidden="true" className="-mt-1 grid gap-1 text-xs tabular-nums" style={cols}>
          {p.steps.map((s) => (
            <span key={s.milestone} className={s.reached ? "text-right font-medium" : "text-right text-muted-foreground"}>
              <span className="inline-block translate-x-[calc(50%-0.625rem)]">{n(s.at)}</span>
            </span>
          ))}
        </span>
        <span className="text-xs text-muted-foreground">
          {preview
            ? "Bonus points as the points you earn from orders add up."
            : next
              ? `${n(p.earned)} of ${n(next.at)} points earned from orders`
              : "You've reached every milestone."}
        </span>
      </summary>
      <ol className="space-y-2 px-5 pb-5 text-sm sm:px-6 sm:pb-6">
        {p.steps.map((s) => (
          <li key={s.milestone} className="flex items-baseline justify-between gap-3">
            <span className={s.reached ? undefined : "text-muted-foreground"}>At {n(s.at)} points earned</span>
            <span className="inline-flex items-center gap-1 tabular-nums">
              {s.reached ? <Check className="h-3.5 w-3.5 self-center text-blue-500" aria-hidden="true" /> : null}
              <span className="font-medium">+{formatPointsCount(s.bonus)}</span>
              <span className="text-muted-foreground">({worth(s.bonus)})</span>
              {s.reached ? <span className="sr-only">, reached</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </details>
  );
}
