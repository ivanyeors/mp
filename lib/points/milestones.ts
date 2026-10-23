/**
 * Bonus milestones (PRD-loyalty-points slice 09; ADR 0030 rules s to w;
 * 20261023120000_points_milestones.sql). Pure.
 *
 * A ladder on the points a Customer has earned from orders over their
 * lifetime: every `earn` less every `clawback`. Reaching a milestone adds a
 * one-time bonus, granted by the daily job. Spending, expiry, Staff
 * adjustments and bonuses neither move the bar nor set it back.
 *
 * The ladder is one `site_settings` value, "points earned:bonus" pairs:
 * "1000:100,2500:300". `parseMilestones` reads it exactly as SQL's
 * `points_milestones()` does, so the Profile's bar and the grant agree.
 */
import { POINTS_PER_DOLLAR } from "./value";

export interface PointsMilestone {
  /** Points earned from orders that reach it. */
  at: number;
  /** Points added, once, on reaching it. */
  bonus: number;
}

/** The ladder the migration seeds; the owner edits it on Settings → Discounts → Points. */
export const SEEDED_MILESTONES: readonly PointsMilestone[] = [
  { at: 1000, bonus: 100 },
  { at: 2500, bonus: 300 },
  { at: 5000, bonus: 800 },
  { at: 10000, bonus: 2000 },
];

/** The most milestones a ladder may hold: the bar has room for five. */
export const MAX_MILESTONES = 5;

const LADDER = /^[0-9]{1,7}:[0-9]{1,7}( *, *[0-9]{1,7}:[0-9]{1,7})*$/;

/**
 * Pure — the ladder in a setting, lowest first. A missing, blank or malformed
 * value is no milestones: every pair digits, every number above 0, and no two
 * at the same number of points, as `points_milestones()` reads it.
 */
export function parseMilestones(value: string | null | undefined): PointsMilestone[] {
  const v = (value ?? "").trim();
  if (!LADDER.test(v)) return [];
  const list = v.split(/ *, */).map((p) => {
    const [at, bonus] = p.split(":");
    return { at: Number(at), bonus: Number(bonus) };
  });
  if (list.some((m) => m.at <= 0 || m.bonus <= 0)) return [];
  if (new Set(list.map((m) => m.at)).size !== list.length) return [];
  return list.sort((a, b) => a.at - b.at);
}

/** Pure — the setting's value for a ladder; "" for none. */
export function formatMilestones(list: readonly PointsMilestone[]): string {
  return [...list]
    .sort((a, b) => a.at - b.at)
    .map((m) => `${m.at}:${m.bonus}`)
    .join(",");
}

export interface MilestoneStep extends PointsMilestone {
  /** 1 for the lowest. */
  milestone: number;
  reached: boolean;
  /** How much of this step's stretch of the bar is earned, 0 to 1. */
  fill: number;
  /** The same, with pending points added: what the bar shows as on its way. */
  pendingFill: number;
}

export interface MilestoneProgress {
  earned: number;
  pending: number;
  steps: MilestoneStep[];
  /** The lowest milestone not reached, and the points still to earn; null when every one is. */
  next: (PointsMilestone & { milestone: number; toGo: number }) | null;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);

/**
 * Pure — where a customer stands on the ladder. Each milestone gets an equal
 * stretch of the bar, from the one before it (or 0) to its own number, so the
 * first milestones aren't squeezed against the start by a large last one.
 */
export function milestoneProgress(
  ladder: readonly PointsMilestone[],
  earned: number,
  pending = 0,
): MilestoneProgress {
  const e = Math.max(Math.round(earned) || 0, 0);
  const p = Math.max(Math.round(pending) || 0, 0);
  const sorted = [...ladder].sort((a, b) => a.at - b.at);
  const steps = sorted.map((m, i) => {
    const from = i === 0 ? 0 : sorted[i - 1]!.at;
    const span = m.at - from;
    return {
      ...m,
      milestone: i + 1,
      reached: e >= m.at,
      fill: clamp01((e - from) / span),
      pendingFill: clamp01((e + p - from) / span),
    };
  });
  const first = steps.find((s) => !s.reached);
  return {
    earned: e,
    pending: p,
    steps,
    next: first ? { milestone: first.milestone, at: first.at, bonus: first.bonus, toGo: first.at - e } : null,
  };
}

export interface MilestoneCostRow extends PointsMilestone {
  milestone: number;
  /** Roughly what a customer pays for products to reach it, at the earn rate; null at a rate of 0. */
  spend: number | null;
  /** Every bonus up to and including this one. */
  bonusesSoFar: number;
  /**
   * What the customer has back at that spend, earned points and bonuses, as a
   * share of the spend: 0.0396 is 3.96%. Null at a rate of 0.
   */
  backShare: number | null;
}

/**
 * Pure — what each milestone costs, for the owner: the spend that reaches it
 * and the effective share back, earn rate and bonuses together.
 */
export function milestoneCostRows(ladder: readonly PointsMilestone[], earnPerDollar: number): MilestoneCostRow[] {
  let sum = 0;
  return [...ladder]
    .sort((a, b) => a.at - b.at)
    .map((m, i) => {
      sum += m.bonus;
      const spend = earnPerDollar > 0 ? Math.ceil(m.at / earnPerDollar) : null;
      return {
        ...m,
        milestone: i + 1,
        spend,
        bonusesSoFar: sum,
        backShare: spend ? (m.at + sum) / POINTS_PER_DOLLAR / spend : null,
      };
    });
}
