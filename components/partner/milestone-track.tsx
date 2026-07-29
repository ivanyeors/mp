import { supabaseAdmin } from "@/lib/supabase/server";
import { loadMilestoneDashboard } from "@/lib/milestones/ledger";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The gamified milestone spine — the first thing a partner sees on the hub (#79).
 * Self-contained async server component: fetches its own data. Shows a goal-gradient
 * progress bar ("X pillows to your next reward"), current tier + perks, a "top N%"
 * percentile chip (NO leaderboard / ranked list), and a surprise-gift note at the
 * latest rung crossing. Self-purchases are unattributed so they never move the bar.
 */
export async function MilestoneTrack({ partnerId }: { partnerId: string }) {
  const d = await loadMilestoneDashboard(supabaseAdmin(), partnerId);

  const nextLabel = d.nextRung
    ? `${d.unitsToNext} pillow${d.unitsToNext === 1 ? "" : "s"} to your next reward`
    : "Top tier reached — every pillow still counts";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Your progress</CardTitle>
            <CardDescription>
              Tier {d.currentTier} · {d.units} pillows credited
            </CardDescription>
          </div>
          {d.topPercent !== null ? (
            <Badge variant="secondary" title="Among all Mpillow partners">
              Top {d.topPercent}%
            </Badge>
          ) : null}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{nextLabel}</span>
            {d.nextRung ? (
              <span className="text-muted-foreground">
                {d.units} / {d.nextRung.units_threshold}
              </span>
            ) : null}
          </div>
          <Progress value={d.progressPercent} />
        </div>

        {/* Endowed start — always stated with its reason (AC2). */}
        <p className="text-xs text-muted-foreground">
          Includes a head start of {d.endowedUnits} pillows ({d.endowedReason}).
        </p>

        {d.perks.length > 0 ? (
          <div className="space-y-1">
            <p className="text-sm font-medium">Your perks</p>
            <ul className="flex flex-wrap gap-2">
              {d.perks.map((perk) => (
                <li key={perk}>
                  <Badge variant="outline">{perk}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {d.latestReward ? (
          <div className="rounded-md border border-dashed p-3 text-sm">
            <span aria-hidden>🎁 </span>
            <span className="font-medium">Surprise reward unlocked — Tier {d.latestReward.tier}:</span>{" "}
            {d.latestReward.cash_bonus > 0 ? `$${d.latestReward.cash_bonus.toFixed(2)} bonus` : "reward"}
            {d.latestReward.perk_label ? ` + ${d.latestReward.perk_label}` : ""}.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
