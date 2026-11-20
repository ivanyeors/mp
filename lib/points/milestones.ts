import { POINTS_PER_DOLLAR } from "./value";

export interface PointsMilestone {
  at: number;
  bonus: number;
}

export const SEEDED_MILESTONES: readonly PointsMilestone[] = [
  { at: 1000, bonus: 100 },
  { at: 2500, bonus: 300 },
  { at: 5000, bonus: 800 },
  { at: 10000, bonus: 2000 },
];

export const MAX_MILESTONES = 5;

const LADDER = /^[0-9]{1,7}:[0-9]{1,7}( *, *[0-9]{1,7}:[0-9]{1,7})*$/;

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

export function formatMilestones(list: readonly PointsMilestone[]): string {
  return [...list]
    .sort((a, b) => a.at - b.at)
    .map((m) => `${m.at}:${m.bonus}`)
    .join(",");
}

export interface MilestoneStep extends PointsMilestone {
  milestone: number;
  reached: boolean;
  fill: number;
  pendingFill: number;
}

export interface MilestoneProgress {
  earned: number;
  pending: number;
  steps: MilestoneStep[];
  next: (PointsMilestone & { milestone: number; toGo: number }) | null;
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);

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
  spend: number | null;
  bonusesSoFar: number;
  backShare: number | null;
}

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
