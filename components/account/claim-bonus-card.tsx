import Link from "next/link";
import { Gift } from "lucide-react";
import type { ClaimBonusView } from "@/lib/points/claim-bonus";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "@/lib/points/value";

const sgDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Singapore" });

export function ClaimBonusCard({ bonus, shopHref, termsHref }: { bonus: ClaimBonusView; shopHref: string; termsHref: string }) {
  if (bonus.kind === "closed") {
    return (
      <section aria-labelledby="claim-bonus-title" className="rounded-lg border p-5 sm:p-6" data-section="claim-bonus">
        <h2 id="claim-bonus-title" className="font-medium leading-snug">
          {`The sign-in bonus for this account ended on ${sgDate(bonus.endedOn)}`}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You still earn points on what you buy.{" "}
          <Link href={termsHref} className="underline">
            How points work
          </Link>
        </p>
      </section>
    );
  }
  const amount = formatDollarsShort(pointsToDollars(bonus.points));
  return (
    <section aria-labelledby="claim-bonus-title" className="space-y-2 rounded-lg border p-5 sm:p-6" data-section="claim-bonus">
      <div className="flex items-start gap-3">
        <Gift className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h2 id="claim-bonus-title" className="font-medium leading-snug">
            {`${amount} in points is in your account`}
          </h2>
          <p className="text-sm text-muted-foreground">
            {`We've added ${formatPointsCount(bonus.points)}. Use them on any shop order, up to half the price.`}{" "}
            <Link href={shopHref} className="underline">
              Shop
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Points can&apos;t be used on custom pillows, and points used are not refunded.{" "}
            <Link href={termsHref} className="underline">
              How points work
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
