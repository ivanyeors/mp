import Link from "next/link";
import { Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PendingOrderPoints, PointsBalance } from "@/lib/points/server";
import { POINTS_PER_DOLLAR, formatPoints, formatPointsCount } from "@/lib/points/value";

const sgDate = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00+08:00` : iso).toLocaleDateString("en-SG", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Singapore",
  });

/**
 * Profile → Points (PRD-loyalty-points slice 02; ADR 0030): the customer's own
 * balance in points and dollars, what is pending and from when it is usable,
 * and when the balance expires. Read server-side for the session's Customer;
 * shown only while points are on.
 */
export function PointsCard({
  balance,
  pending,
  termsHref,
  shopHref,
}: {
  balance: PointsBalance;
  pending: PendingOrderPoints[];
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
            Use them as money off your next shop order, in S$1 steps, at checkout.{" "}
            <Link href={shopHref} className="underline">
              Shop
            </Link>
          </p>
          {balance.expiresOn ? <p className="text-sm text-muted-foreground">Expires on {sgDate(balance.expiresOn)}.</p> : null}
        </div>
      </div>

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

/**
 * Profile → Points before the launch: what points will be, with the live
 * earn rate, and no balance. Shown until points are live; partners never see it.
 */
export function PointsComingSoonCard({ earnPerDollar, termsHref }: { earnPerDollar: number; termsHref: string }) {
  return (
    <section aria-labelledby="points-title" className="rounded-lg border p-5 sm:p-6" data-section="points">
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
            {earnPerDollar > 0 ? `You'll earn ${earnPerDollar} points for every S$1 you pay for products, before GST. ` : null}
            {`Use them as money off a later order: ${formatPointsCount(POINTS_PER_DOLLAR)} take S$1 off.`}
          </p>
          <p className="text-xs text-muted-foreground">
            <Link href={termsHref} className="underline">
              How points will work
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
