import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Coins } from "lucide-react";
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
    <section
      aria-labelledby="points-title"
      className="divide-y overflow-hidden rounded-lg border"
      data-section="points"
      data-typography-scope="app"
    >
      {children}
    </section>
  );
}

const HERO_BLUE = "linear-gradient(135deg, rgb(0, 23, 54) 0%, rgb(7, 55, 120) 55%, rgb(43, 105, 188) 100%)";
const HERO_SHEEN = "inset 1px 1px 1.8px 0px rgba(194, 220, 255, 0.5), inset -4px 13px 28.4px 0px rgba(102, 167, 255, 0.25)";

function PointsHero({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden p-5 text-white sm:p-6" style={{ backgroundImage: HERO_BLUE }} data-section="points-hero">
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ boxShadow: HERO_SHEEN }} />
      <span aria-hidden="true" className="mp-chat-aurora-a pointer-events-none absolute -right-10 -top-16 -z-10 size-48 rounded-full bg-blue-400/40 blur-3xl" />
      <span aria-hidden="true" className="mp-chat-aurora-b pointer-events-none absolute -bottom-20 right-16 -z-10 size-40 rounded-full bg-sky-300/25 blur-3xl" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 -z-10 size-56 rounded-full border border-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-14 -right-6 -z-10 size-36 rounded-full border border-white/10" />
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-4 right-4 -z-10 size-16 rounded-full border border-white/15" />
      {children}
    </div>
  );
}

function HeroTitle({ children }: { children: ReactNode }) {
  return (
    <h2 id="points-title" className="flex items-center gap-2 text-sm font-medium leading-snug text-blue-100">
      <span className="flex size-7 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/20">
        <Coins className="size-3.5" aria-hidden="true" />
      </span>
      {children}
    </h2>
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
      <PointsHero>
        <div className="flex items-start justify-between gap-3">
          <HeroTitle>Points</HeroTitle>
          <Button asChild size="sm" className="shrink-0 rounded-full bg-white text-blue-950 shadow-none hover:bg-white/90 active:bg-white/80">
            <Link href={shopHref}>
              Shop
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <p className="mt-4 text-5xl font-semibold leading-none tracking-tight tabular-nums">
          {count(balance.available)}
          <span className="sr-only"> points</span>
        </p>
        <p className="mt-2 text-sm text-blue-100">
          {balance.available > 0 ? (
            <>
              Worth <span className="font-medium text-white">{formatDollars(pointsToDollars(balance.available))}</span> off shop orders
            </>
          ) : (
            "Money off shop orders"
          )}
        </p>
      </PointsHero>

      {milestones && hasMilestones ? <MilestoneBar ladder={milestones.ladder} earned={milestones.earned} pending={balance.pending} /> : null}

      {pending.length ? (
        <div className="space-y-3 p-5 sm:p-6" data-section="points-pending">
          <p className="flex items-center gap-2 text-sm font-medium">
            {hasMilestones ? <span aria-hidden="true" className="size-2 rounded-full bg-blue-400/50" /> : null}
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
                <span className="shrink-0 font-medium tabular-nums text-blue-600 dark:text-blue-400">
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
      <PointsHero>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <HeroTitle>Mpillow Points</HeroTitle>
          <Badge variant="outline" className="border-white/25 bg-white/10 text-white">
            Coming soon
          </Badge>
        </div>
        <p className="mt-4 max-w-sm text-base leading-snug text-blue-50">
          {earnPerDollar > 0
            ? `You'll earn ${formatEarnRate(earnPerDollar)} for every S$1 you pay for products, before GST.`
            : "Money off shop orders."}
        </p>
      </PointsHero>

      {milestones.length ? <MilestoneBar ladder={milestones} preview /> : null}

      <PointsFacts
        label="How points will work"
        termsHref={termsHref}
        facts={[`${formatPointsCount(POINTS_PER_DOLLAR)} take S$1 off a later shop order.`, "Points don't expire."]}
      />
    </PointsShell>
  );
}
