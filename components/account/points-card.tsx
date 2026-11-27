import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PointsMilestone } from "@/lib/points/milestones";
import type { PendingOrderPoints, PointsBalance } from "@/lib/points/server";
import { POINTS_PER_DOLLAR, formatDollars, formatEarnRate, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import { MilestoneBar } from "./milestone-bar";

const sgDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

const count = (points: number) => Math.round(points).toLocaleString("en-SG");

function PointsFacts({ label, facts, termsHref }: { label: string; facts: string[]; termsHref: string }) {
  return (
    <details className="group" data-section="points-facts">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-medium transition-colors hover:bg-muted/50 active:bg-press sm:px-6 [&::-webkit-details-marker]:hidden">
        {label}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-5 pb-5 text-sm text-muted-foreground sm:px-6 sm:pb-6">
        <ul className="list-disc space-y-1.5 pl-4">
          {facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        <Link href={termsHref} className="inline-block underline underline-offset-4">
          Full points terms
        </Link>
      </div>
    </details>
  );
}

function PointsShell({ children }: { children: ReactNode }) {
  return (
    <section aria-labelledby="points-title" className="divide-y overflow-hidden rounded-lg border" data-section="points" data-typography-scope="app">
      {children}
    </section>
  );
}

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
  const hasMilestones = Boolean(milestones?.ladder.length);
  return (
    <PointsShell>
      <div className="flex items-start justify-between gap-3 p-5 sm:p-6">
        <div className="min-w-0">
          <h2 id="points-title" className="flex items-center gap-2 text-base font-medium leading-snug">
            <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
            Points
          </h2>
          <p className="mt-3 text-4xl font-semibold leading-none tracking-tight tabular-nums">
            {count(balance.available)}
            <span className="sr-only"> points</span>
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {balance.available > 0 ? `Worth ${formatDollars(pointsToDollars(balance.available))} off shop orders` : "Money off shop orders"}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link href={shopHref}>Shop</Link>
        </Button>
      </div>

      {milestones && hasMilestones ? <MilestoneBar ladder={milestones.ladder} earned={milestones.earned} pending={balance.pending} /> : null}

      {pending.length ? (
        <div className="space-y-3 p-5 sm:p-6" data-section="points-pending">
          <p className="flex items-center gap-2 text-sm font-medium">
            {hasMilestones ? <span aria-hidden="true" className="size-2 rounded-full bg-primary/30" /> : null}
            On their way
          </p>
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.orderId} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block">Order {p.orderNumber}</span>
                  <span className="block text-xs text-muted-foreground">
                    {p.releaseAt ? `Usable from ${sgDate(p.releaseAt)}` : "Usable 30 days after delivery"}
                  </span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  +{count(p.points)}
                  <span className="sr-only"> points</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <PointsFacts
        label="How points work"
        termsHref={termsHref}
        facts={[
          `${formatPointsCount(POINTS_PER_DOLLAR)} take S$1 off a shop order, in S$1 steps, at checkout.`,
          "Points don't expire.",
          "Points can't be used on custom pillows, and points used are not refunded.",
          ...(hasMilestones
            ? ["Only points earned from orders count towards a bonus. Points on their way count once they're usable."]
            : []),
        ]}
      />
    </PointsShell>
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
    <PointsShell>
      <div className="space-y-2 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="points-title" className="flex items-center gap-2 text-base font-medium leading-snug">
            <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />
            Mpillow Points
          </h2>
          <Badge variant="outline">Coming soon</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {earnPerDollar > 0
            ? `You'll earn ${formatEarnRate(earnPerDollar)} for every S$1 you pay for products, before GST.`
            : "Money off shop orders."}
        </p>
      </div>

      {milestones.length ? <MilestoneBar ladder={milestones} preview /> : null}

      <PointsFacts
        label="How points will work"
        termsHref={termsHref}
        facts={[`${formatPointsCount(POINTS_PER_DOLLAR)} take S$1 off a later shop order.`, "Points don't expire."]}
      />
    </PointsShell>
  );
}
