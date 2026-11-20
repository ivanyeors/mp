import Link from "next/link";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PointsMilestone } from "@/lib/points/milestones";
import type { PendingOrderPoints, PointsBalance } from "@/lib/points/server";
import { POINTS_PER_DOLLAR, formatEarnRate, formatPoints, formatPointsCount } from "@/lib/points/value";
import { MilestoneBar } from "./milestone-bar";

const sgDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

export function PointsCard({
  balance,
  pending,
  milestones,
  termsHref,
  shopHref,
}: {
  balance: PointsBalance;
  pending: PendingOrderPoints[];
  milestones?: { ladder: PointsMilestone[]; earned: number } | null;
  termsHref: string;
  shopHref: string;
}) {
  return (
    <section aria-labelledby="points-title" className="space-y-4 rounded-lg border p-5 sm:p-6" data-section="points">
      <div className="flex items-start gap-3">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h2 id="points-title" className="font-medium leading-snug">
            Your points: {formatPoints(balance.available)}
          </h2>
          <p className="text-sm text-muted-foreground">
            Use them as money off your next shop order, in S$1 steps, at checkout. They don&apos;t expire.{" "}
            <Link href={shopHref} className="underline">
              Shop
            </Link>
          </p>
        </div>
      </div>

      {milestones?.ladder.length ? <MilestoneBar ladder={milestones.ladder} earned={milestones.earned} pending={balance.pending} /> : null}

      {pending.length ? (
        <div className="space-y-1 text-sm">
          <p className="font-medium">On their way</p>
          <ul className="space-y-1 text-muted-foreground">
            {pending.map((p) => (
              <li key={p.orderId}>
                {formatPoints(p.points)} from order {p.orderNumber},{" "}
                {p.releaseAt ? `usable from ${sgDate(p.releaseAt)}` : "usable 30 days after it's delivered"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Points can&apos;t be used on custom pillows, and points used are not refunded.{" "}
        <Link href={termsHref} className="underline">
          How points work
        </Link>
      </p>
    </section>
  );
}

export function PointsComingSoonCard({
  earnPerDollar,
  milestones = [],
  termsHref,
}: {
  earnPerDollar: number;
  milestones?: PointsMilestone[];
  termsHref: string;
}) {
  return (
    <section aria-labelledby="points-title" className="space-y-4 rounded-lg border p-5 sm:p-6" data-section="points">
      <div className="flex items-start gap-3">
        <Coins className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="points-title" className="font-medium leading-snug">
              Mpillow Points
            </h2>
            <Badge variant="outline">Coming soon</Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            {earnPerDollar > 0 ? `You'll earn ${formatEarnRate(earnPerDollar)} for every S$1 you pay for products, before GST. ` : null}
            {`Use them as money off a later order: ${formatPointsCount(POINTS_PER_DOLLAR)} take S$1 off. They don't expire.`}
          </p>
        </div>
      </div>

      {milestones.length ? <MilestoneBar ladder={milestones} preview /> : null}

      <p className="text-xs text-muted-foreground">
        <Link href={termsHref} className="underline">
          How points will work
        </Link>
      </p>
    </section>
  );
}
