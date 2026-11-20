import type { PointsSettings } from "./settings";
import { formatDollarsShort, formatPointsCount, pointsToDollars } from "./value";

export type ClaimBonusOffer =
  | {
      live: true;
      points: string;
      amount: string;
      months: number;
    }
  | { live: false; reason: string };

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
