import { pointsForOrder } from "@/lib/points/earn";
import { formatDollars, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import type { ReadjustmentPolicy } from "@/lib/pricing/service-prices";
import { copyMoney } from "@/lib/pricing/service-copy";

export type ReviewPromiseTerms = {
  readjustmentFee: number;
  policy: ReadjustmentPolicy;
};

const FILLINGS_WARRANTY = "10-year warranty on the fillings";

export function pillowPromises(tier: string | null | undefined, terms: ReviewPromiseTerms): string[] {
  const fee = copyMoney(terms.readjustmentFee);
  if (tier !== "premium") {
    return [`Re-adjustments at ${fee} per visit, at our service centre`, "30-day fit support window for size exchanges"];
  }
  const { freeVisits, freeWindowDays } = terms.policy;
  const free =
    freeVisits > 0 && freeWindowDays > 0
      ? `${freeVisits} free re-adjustment${freeVisits === 1 ? "" : "s"} within ${freeWindowDays} days of your purchase, then ${fee} per visit`
      : `Re-adjustments at ${fee} per visit`;
  return [FILLINGS_WARRANTY, free, "Filling changes at a re-adjustment are included (accessories excluded)"];
}

export function bolsterPromises(terms: ReviewPromiseTerms): string[] {
  return [
    FILLINGS_WARRANTY,
    `Re-adjustments at ${copyMoney(terms.readjustmentFee)} per visit, at our service centre`,
    "Every component is washable",
  ];
}

export function pointsPromise(base: number | null, earnPerDollar: number | null): { points: string; worth: string } | null {
  if (base == null || earnPerDollar == null) return null;
  const points = pointsForOrder({ subtotal: base, discount: 0, refunded: 0 }, earnPerDollar);
  if (points <= 0) return null;
  return { points: formatPointsCount(points), worth: formatDollars(pointsToDollars(points)) };
}
