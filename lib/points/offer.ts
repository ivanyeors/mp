/**
 * Whether an email may promise the Claim bonus now (PRD-loyalty-points slice
 * 05; ADR 0030 f). An email never promises points a sign-in would not grant
 * and the shop would not take: points on, launched, a bonus above 0 and a
 * window of at least a month. The wave sender and Email campaigns both ask
 * this before they send anything that names points.
 */
import type { PointsSettings } from "./settings";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "./value";

export type ClaimBonusOffer =
  | {
      live: true;
      /** "1,000 points". */
      points: string;
      /** "S$10". */
      amount: string;
      /** Months from the email to sign in for it. */
      months: number;
    }
  | { live: false; reason: string };

/** Pure — the Claim bonus as an email states it, or why no email may. */
export function claimBonusOffer(s: PointsSettings, now: Date = new Date()): ClaimBonusOffer {
  if (!s.enabled) return { live: false, reason: "points are off" };
  if (!s.launchAt) return { live: false, reason: "points have no launch date" };
  if (Date.parse(s.launchAt) > now.getTime()) return { live: false, reason: `points launch on ${s.launchAt}, not yet` };
  if (s.claimBonus <= 0) return { live: false, reason: "the Claim bonus is 0" };
  if (s.claimBonusMonths <= 0) return { live: false, reason: "the Claim bonus window is 0 months" };
  return {
    live: true,
    points: formatPointsCount(s.claimBonus),
    amount: formatDollarsShort(pointsToDollars(s.claimBonus)),
    months: s.claimBonusMonths,
  };
}
