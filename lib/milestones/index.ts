/**
 * Milestone track calc (#79, ADR 0015). PURE — no I/O, no supabaseAdmin — so the
 * ladder/ratchet math is unit-testable in isolation (slice #85). DB reads/writes
 * live in ./ledger, which imports this module.
 *
 * Unit model:
 *  - units = ENDOWED_UNITS (a "launch partner bonus" head start) + the partner's
 *    count of NON-VOID commission rows (#77). A refund-void drops a row, so the bar
 *    decrements honestly. Self-purchases are UNATTRIBUTED (partner_id null) → no
 *    commission row → auto-excluded.
 *  - currentTier climbs as units cross rung thresholds. The stored max_tier RATCHETS
 *    it: a tier is never demoted once reached, even if units later fall on a refund.
 *  - rate_bump is percentage points; the cumulative bump across achieved tiers is
 *    added to the partner's commission scheme override (feeds #77 for SUBSEQUENT orders).
 */

export const ENDOWED_UNITS = 2;
export const ENDOWED_REASON = "launch partner bonus";

export interface MilestoneRung {
  tier: number;
  units_threshold: number;
  cash_bonus: number;
  rate_bump: number;
  perk_label: string;
}

/** Rungs sorted by threshold ascending — every helper assumes this order. */
export function sortRungs(rungs: MilestoneRung[]): MilestoneRung[] {
  return [...rungs].sort((a, b) => a.units_threshold - b.units_threshold);
}

/** Highest rung tier whose threshold units have been reached (0 = below the first rung). */
export function currentTierFor(units: number, rungs: MilestoneRung[]): number {
  let tier = 0;
  for (const r of sortRungs(rungs)) if (units >= r.units_threshold) tier = r.tier;
  return tier;
}

/** Ratchet: the effective tier never drops below the stored max. */
export function ratchetTier(storedMaxTier: number, computedTier: number): number {
  return Math.max(storedMaxTier, computedTier);
}

/** The next rung above the current units, or null once the top rung is reached. */
export function nextRungFor(units: number, rungs: MilestoneRung[]): MilestoneRung | null {
  return sortRungs(rungs).find((r) => units < r.units_threshold) ?? null;
}

/** Whole units still needed to reach the next rung (0 when already at the top). */
export function unitsToNext(units: number, rungs: MilestoneRung[]): number {
  const next = nextRungFor(units, rungs);
  return next ? Math.max(0, next.units_threshold - units) : 0;
}

/** Perk labels for every tier up to and including `tier` (in ladder order). */
export function perksUpTo(tier: number, rungs: MilestoneRung[]): string[] {
  return sortRungs(rungs)
    .filter((r) => r.tier <= tier && r.perk_label)
    .map((r) => r.perk_label);
}

/** Sum of rate_bump (percentage points) for every achieved tier — the permanent bump. */
export function cumulativeRateBump(tier: number, rungs: MilestoneRung[]): number {
  return sortRungs(rungs)
    .filter((r) => r.tier <= tier)
    .reduce((sum, r) => sum + Number(r.rate_bump), 0);
}

/**
 * Goal-gradient fill 0..100: progress WITHIN the current band (prev threshold → next
 * threshold). Returns 100 once the top rung is reached. `tier` is the ratcheted tier.
 */
export function progressToNext(units: number, rungs: MilestoneRung[], tier: number): number {
  const sorted = sortRungs(rungs);
  const next = nextRungFor(units, rungs);
  if (!next) return 100;
  const prevThreshold = sorted.filter((r) => r.tier <= tier).at(-1)?.units_threshold ?? 0;
  const span = next.units_threshold - prevThreshold;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((units - prevThreshold) / span) * 100));
}

/**
 * "Top N%" bucket from the distribution of ALL partners' unit counts (no ranked
 * list / leaderboard — just this partner's percentile bracket). Returns the smallest
 * of [1,5,10,25,50] that the partner's rank fits, or null (too few partners, or
 * bottom half — no bragging chip). `allUnitCounts` includes this partner.
 */
export function topPercentBucket(units: number, allUnitCounts: number[]): number | null {
  const total = allUnitCounts.length;
  if (total < 3) return null; // need a real distribution before bragging
  const strictlyGreater = allUnitCounts.filter((c) => c > units).length;
  const rankPercent = (100 * (strictlyGreater + 1)) / total;
  for (const b of [1, 5, 10, 25, 50]) if (rankPercent <= b) return b;
  return null;
}

export interface MilestoneState {
  units: number;
  endowedUnits: number;
  endowedReason: string;
  currentTier: number;
  nextRung: MilestoneRung | null;
  unitsToNext: number;
  perks: string[];
  cumulativeRateBump: number;
  progressPercent: number;
}

/**
 * One-call summary for the hub component. `units` already includes the endowed head
 * start; `storedMaxTier` ratchets the displayed tier so it never demotes.
 */
export function milestoneState(
  units: number,
  rungs: MilestoneRung[],
  storedMaxTier: number,
  endowedUnits: number = ENDOWED_UNITS,
): MilestoneState {
  const tier = ratchetTier(storedMaxTier, currentTierFor(units, rungs));
  return {
    units,
    endowedUnits,
    endowedReason: ENDOWED_REASON,
    currentTier: tier,
    nextRung: nextRungFor(units, rungs),
    unitsToNext: unitsToNext(units, rungs),
    perks: perksUpTo(tier, rungs),
    cumulativeRateBump: cumulativeRateBump(tier, rungs),
    progressPercent: progressToNext(units, rungs, tier),
  };
}
