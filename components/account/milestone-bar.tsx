import { Check } from "lucide-react";
import { milestoneProgress, type PointsMilestone } from "@/lib/points/milestones";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "@/lib/points/value";

const n = (v: number) => v.toLocaleString("en-SG");
const pct = (f: number) => `${Math.round(f * 1000) / 10}%`;

/**
 * Profile → Points → Bonus milestones (PRD-loyalty-points slice 09; ADR 0030
 * s to w): the ladder as one bar, an equal stretch per milestone, filled by
 * the points earned from orders, with points on their way shown lighter. Each
 * milestone's bonus sits above its end and its number of points below.
 * `preview` shows the ladder empty, before the launch. Nothing without a
 * ladder.
 */
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

  return (
    <div className="space-y-2" data-section="points-milestones">
      <div className="space-y-1">
        <p className="text-sm font-medium">Bonus milestones</p>
        <p className="text-sm text-muted-foreground">
          {preview
            ? "As the points you earn from orders add up, we'll add bonus points at each milestone."
            : p.next
              ? `Earn ${n(p.next.toGo)} more points from orders to reach ${n(p.next.at)}, and we'll add ${formatPointsCount(p.next.bonus)} (${formatDollarsShort(pointsToDollars(p.next.bonus))}).`
              : "You've reached every milestone."}
          {!preview && p.next && p.pending > 0 ? " The lighter part is points on their way: they count once they're usable." : null}
        </p>
      </div>

      <ol className="grid gap-1 pt-1 text-xs" style={cols}>
        {p.steps.map((s) => (
          <li key={s.milestone} className="text-right">
            <span aria-hidden="true" className={s.reached ? "inline-flex items-center gap-0.5 font-medium" : "font-medium text-muted-foreground"}>
              {s.reached ? <Check className="h-3 w-3" /> : null}+{n(s.bonus)}
            </span>
            <span className="sr-only">
              {`${n(s.at)} points earned from orders: ${formatPointsCount(s.bonus)} added${s.reached ? ", reached" : ""}.`}
            </span>
          </li>
        ))}
      </ol>
      <div aria-hidden="true" className="flex gap-1">
        {p.steps.map((s) => (
          <div key={s.milestone} className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
            {s.pendingFill > s.fill ? <div className="absolute inset-y-0 left-0 bg-primary/30" style={{ width: pct(s.pendingFill) }} /> : null}
            {s.fill > 0 ? <div className="absolute inset-y-0 left-0 bg-primary" style={{ width: pct(s.fill) }} /> : null}
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="grid gap-1 text-xs text-muted-foreground" style={cols}>
        {p.steps.map((s) => (
          <span key={s.milestone} className="text-right">
            {n(s.at)}
          </span>
        ))}
      </div>
    </div>
  );
}
