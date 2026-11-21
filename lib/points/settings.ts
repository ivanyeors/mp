import { z } from "zod";
import { MAX_MILESTONES, formatMilestones, parseMilestones, type PointsMilestone } from "./milestones";

export const POINTS_SETTING_KEYS = {
  enabled: "points_enabled",
  launchAt: "points_launch_at",
  earnPerDollar: "points_earn_per_dollar",
  minRedeem: "points_min_redeem",
  maxShare: "points_max_share",
  claimBonus: "points_claim_bonus",
  claimBonusMonths: "points_claim_bonus_months",
  milestones: "points_milestones",
} as const;

export interface PointsSettings {
  enabled: boolean;
  launchAt: string | null;
  earnPerDollar: number;
  minRedeem: number;
  maxShare: number;
  claimBonus: number;
  claimBonusMonths: number;
  milestones: PointsMilestone[];
}

export const POINTS_DEFAULTS: PointsSettings = {
  enabled: false,
  launchAt: null,
  earnPerDollar: 1,
  minRedeem: 500,
  maxShare: 0.5,
  claimBonus: 1000,
  claimBonusMonths: 3,
  milestones: [],
};

const num = (v: string | undefined, ok: (n: number) => boolean, fallback: number) => {
  const n = v == null || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && ok(n) ? n : fallback;
};

export function pointsSettingsFromRows(rows: readonly { key: string; value: string | null }[]): PointsSettings {
  const get = (k: string) => rows.find((r) => r.key === k)?.value ?? undefined;
  const launch = get(POINTS_SETTING_KEYS.launchAt)?.trim();
  return {
    enabled: get(POINTS_SETTING_KEYS.enabled)?.trim().toLowerCase() === "true",
    launchAt: launch && /^\d{4}-\d{2}-\d{2}/.test(launch) && Number.isFinite(Date.parse(launch)) ? new Date(launch).toISOString() : null,
    earnPerDollar: num(get(POINTS_SETTING_KEYS.earnPerDollar), (n) => n >= 0, POINTS_DEFAULTS.earnPerDollar),
    minRedeem: num(get(POINTS_SETTING_KEYS.minRedeem), (n) => Number.isInteger(n) && n >= 0, POINTS_DEFAULTS.minRedeem),
    maxShare: num(get(POINTS_SETTING_KEYS.maxShare), (n) => n >= 0 && n <= 1, POINTS_DEFAULTS.maxShare),
    claimBonus: num(get(POINTS_SETTING_KEYS.claimBonus), (n) => Number.isInteger(n) && n >= 0, POINTS_DEFAULTS.claimBonus),
    claimBonusMonths: num(get(POINTS_SETTING_KEYS.claimBonusMonths), (n) => Number.isInteger(n) && n >= 0, POINTS_DEFAULTS.claimBonusMonths),
    milestones: parseMilestones(get(POINTS_SETTING_KEYS.milestones)),
  };
}

export function pointsLive(s: Pick<PointsSettings, "enabled" | "launchAt">, now: Date = new Date()): boolean {
  return s.enabled && s.launchAt !== null && Date.parse(s.launchAt) <= now.getTime();
}

export function profilePointsView(s: Pick<PointsSettings, "enabled" | "launchAt">, now: Date = new Date()): "live" | "soon" | "off" {
  if (pointsLive(s, now)) return "live";
  return s.launchAt === null || Date.parse(s.launchAt) > now.getTime() ? "soon" : "off";
}

export const PointsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    launchAt: z
      .string()
      .trim()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v))), "Pick a launch date and time."),
    earnPerDollar: z.number().min(0, "At least 0.").max(20, "At most 20 points per S$1."),
    minRedeem: z.number().int().min(100, "At least 100 points (S$1).").max(100000).refine((n) => n % 100 === 0, "Use whole dollars: a multiple of 100."),
    maxShare: z.number().gt(0, "Above 0%.").max(1, "At most 100%."),
    claimBonus: z.number().int().min(0).max(100000).refine((n) => n % 100 === 0, "Use whole dollars: a multiple of 100."),
    claimBonusMonths: z.number().int().min(1, "At least 1 month.").max(24, "At most 24 months."),
    milestones: z
      .array(
        z.object({
          at: z.number().int().min(100, "A milestone is at least 100 points.").max(1_000_000, "A milestone is at most 1,000,000 points.").refine((n) => n % 100 === 0, "Milestones are multiples of 100 points."),
          bonus: z.number().int().min(100, "A bonus is at least 100 points (S$1).").max(100_000, "A bonus is at most 100,000 points.").refine((n) => n % 100 === 0, "Use whole dollars: a multiple of 100."),
        }),
      )
      .max(MAX_MILESTONES, `At most ${MAX_MILESTONES} milestones.`),
  })
  .superRefine((s, ctx) => {
    if (s.enabled && !s.launchAt) ctx.addIssue({ code: "custom", path: ["launchAt"], message: "Set the launch date before turning points on." });
    s.milestones.forEach((m, i) => {
      if (i > 0 && m.at <= s.milestones[i - 1]!.at) {
        ctx.addIssue({ code: "custom", path: ["milestones", i, "at"], message: "Each milestone needs more points than the one before it." });
      }
    });
  });

export function pointsSettingsToRows(s: PointsSettings): { upsert: { key: string; value: string }[]; remove: string[] } {
  const upsert: { key: string; value: string }[] = [
    { key: POINTS_SETTING_KEYS.enabled, value: s.enabled ? "true" : "false" },
    { key: POINTS_SETTING_KEYS.earnPerDollar, value: String(s.earnPerDollar) },
    { key: POINTS_SETTING_KEYS.minRedeem, value: String(s.minRedeem) },
    { key: POINTS_SETTING_KEYS.maxShare, value: String(s.maxShare) },
    { key: POINTS_SETTING_KEYS.claimBonus, value: String(s.claimBonus) },
    { key: POINTS_SETTING_KEYS.claimBonusMonths, value: String(s.claimBonusMonths) },
    { key: POINTS_SETTING_KEYS.milestones, value: formatMilestones(s.milestones) },
  ];
  if (s.launchAt) upsert.push({ key: POINTS_SETTING_KEYS.launchAt, value: new Date(s.launchAt).toISOString() });
  return { upsert, remove: s.launchAt ? [] : [POINTS_SETTING_KEYS.launchAt] };
}
