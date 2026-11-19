/**
 * What the review step promises beside each part of the order (owner,
 * 2026-11-19): the warranty and re-adjustment that come with a build, and the
 * points the order earns. Every line restates the Returns & Warranty page
 * (components/marketing/returns-warranty-page.tsx) or the points rules (ADR
 * 0030), with fees and windows read from Costings → Service fees, so the
 * review never promises something those do not. Pure.
 */
import { pointsForOrder } from "@/lib/points/earn";
import { formatDollars, formatPointsCount, pointsToDollars } from "@/lib/points/value";
import type { ReadjustmentPolicy } from "@/lib/pricing/service-prices";
import { copyMoney } from "@/lib/pricing/service-copy";

export type ReviewPromiseTerms = {
  /** The Re-adjustment Service fee's MSRP. */
  readjustmentFee: number;
  policy: ReadjustmentPolicy;
};

const FILLINGS_WARRANTY = "10-year warranty on the fillings";

/** What comes with the Mpillow, by Tier. Basic has no fillings warranty and no free visit. */
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

/** What comes with the Mbolster. */
export function bolsterPromises(terms: ReviewPromiseTerms): string[] {
  return [
    FILLINGS_WARRANTY,
    `Re-adjustments at ${copyMoney(terms.readjustmentFee)} per visit, at our service centre`,
    "Every component is washable",
  ];
}

/**
 * The points this order would earn, as the review states them, or null when it
 * would earn none. `base` is what points are earned on: products and services
 * after any discount, before shipping and GST (ADR 0030 c).
 */
export function pointsPromise(base: number | null, earnPerDollar: number | null): { points: string; worth: string } | null {
  if (base == null || earnPerDollar == null) return null;
  const points = pointsForOrder({ subtotal: base, discount: 0, refunded: 0 }, earnPerDollar);
  if (points <= 0) return null;
  return { points: formatPointsCount(points), worth: formatDollars(pointsToDollars(points)) };
}
