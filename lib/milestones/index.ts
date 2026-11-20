export const ENDOWED_UNITS = 2;
export const ENDOWED_REASON = "launch partner bonus";

export interface MilestoneRung {
  tier: number;
  units_threshold: number;
  cash_bonus: number;
  rate_bump: number;
  perk_label: string;
}

export function sortRungs(rungs: MilestoneRung[]): MilestoneRung[] {
  return [...rungs].sort((a, b) => a.units_threshold - b.units_threshold);
}

export function currentTierFor(units: number, rungs: MilestoneRung[]): number {
  let tier = 0;
  for (const r of sortRungs(rungs)) if (units >= r.units_threshold) tier = r.tier;
  return tier;
}

export function ratchetTier(storedMaxTier: number, computedTier: number): number {
  return Math.max(storedMaxTier, computedTier);
}

export function nextRungFor(units: number, rungs: MilestoneRung[]): MilestoneRung | null {
  return sortRungs(rungs).find((r) => units < r.units_threshold) ?? null;
}

export function unitsToNext(units: number, rungs: MilestoneRung[]): number {
  const next = nextRungFor(units, rungs);
  return next ? Math.max(0, next.units_threshold - units) : 0;
}

export function perksUpTo(tier: number, rungs: MilestoneRung[]): string[] {
  return sortRungs(rungs)
    .filter((r) => r.tier <= tier && r.perk_label)
    .map((r) => r.perk_label);
}

export function cumulativeRateBump(tier: number, rungs: MilestoneRung[]): number {
  return sortRungs(rungs)
    .filter((r) => r.tier <= tier)
    .reduce((sum, r) => sum + Number(r.rate_bump), 0);
}

export function progressToNext(units: number, rungs: MilestoneRung[], tier: number): number {
  const sorted = sortRungs(rungs);
  const next = nextRungFor(units, rungs);
  if (!next) return 100;
  const prevThreshold = sorted.filter((r) => r.tier <= tier).at(-1)?.units_threshold ?? 0;
  const span = next.units_threshold - prevThreshold;
  if (span <= 0) return 0;
  return Math.max(0, Math.min(100, ((units - prevThreshold) / span) * 100));
}

export function topPercentBucket(units: number, allUnitCounts: number[]): number | null {
  const total = allUnitCounts.length;
  if (total < 3) return null;
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
