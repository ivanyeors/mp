/**
 * The points settings (PRD-loyalty-points slice 02): `site_settings` rows the
 * owner edits on Settings → Discounts → Points. `points_settings()` in SQL
 * reads the same keys with the same defaults, and `points_milestones()` reads
 * the milestone ladder (slice 09) as `parseMilestones` does.
 */
import { z } from "zod";
import { MAX_MILESTONES, formatMilestones, parseMilestones, type PointsMilestone } from "./milestones";
import { POINTS_PER_DOLLAR, percentBack } from "./value";

/** The highest earn rate Staff may save: 20% back. */
export const MAX_EARN_PER_DOLLAR = 2;
const wholeDollars = (n: number) => n % POINTS_PER_DOLLAR === 0;
const WHOLE_DOLLARS = `Use whole dollars: a multiple of ${POINTS_PER_DOLLAR}.`;

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
  /** ISO timestamp; null until the owner sets it. */
  launchAt: string | null;
  earnPerDollar: number;
  minRedeem: number;
  /** 0 to 1: the most of the products' price points may pay. */
  maxShare: number;
  claimBonus: number;
  claimBonusMonths: number;
  /** The bonus milestones, lowest first; empty for none (slice 09). */
  milestones: PointsMilestone[];
}

export const POINTS_DEFAULTS: PointsSettings = {
  enabled: false,
  launchAt: null,
  // ADR 0030, amended 2026-11-08: 1 point per S$1 and 10 points = S$1, so
  // 10% back; the amounts in points keep their dollar value (S$5, S$10).
  earnPerDollar: 1,
  minRedeem: 50,
  maxShare: 0.5,
  claimBonus: 100,
  claimBonusMonths: 3,
  // A missing or malformed ladder is none, never a default one: a bonus is
  // only granted on a ladder that was saved. The migration seeds
  // SEEDED_MILESTONES as the starting ladder.
  milestones: [],
};

const num = (v: string | undefined, ok: (n: number) => boolean, fallback: number) => {
  const n = v == null || v.trim() === "" ? NaN : Number(v);
  return Number.isFinite(n) && ok(n) ? n : fallback;
};

/** Pure — the settings from `site_settings` rows; a missing or malformed one reads as its default. */
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

/** Pure — points are on and their launch has passed: customers earn and spend. */
export function pointsLive(s: Pick<PointsSettings, "enabled" | "launchAt">, now: Date = new Date()): boolean {
  return s.enabled && s.launchAt !== null && Date.parse(s.launchAt) <= now.getTime();
}

/**
 * Pure — the Profile's Points card: the balance once points are live, "coming
 * soon" before the launch, and nothing once they are switched off after it
 * (customers may hold points then, so "coming soon" would be wrong).
 */
export function profilePointsView(s: Pick<PointsSettings, "enabled" | "launchAt">, now: Date = new Date()): "live" | "soon" | "off" {
  if (pointsLive(s, now)) return "live";
  return s.launchAt === null || Date.parse(s.launchAt) > now.getTime() ? "soon" : "off";
}

/** What the Settings card saves, checked on the server. */
export const PointsSettingsSchema = z
  .object({
    enabled: z.boolean(),
    launchAt: z
      .string()
      .trim()
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => v === null || (/^\d{4}-\d{2}-\d{2}/.test(v) && Number.isFinite(Date.parse(v))), "Pick a launch date and time."),
    earnPerDollar: z.number().min(0, "At least 0.").max(MAX_EARN_PER_DOLLAR, `At most ${MAX_EARN_PER_DOLLAR} points per S$1 (${percentBack(MAX_EARN_PER_DOLLAR)}% back).`),
    minRedeem: z.number().int().min(POINTS_PER_DOLLAR, `At least ${POINTS_PER_DOLLAR} points (S$1).`).max(10000).refine(wholeDollars, WHOLE_DOLLARS),
    maxShare: z.number().gt(0, "Above 0%.").max(1, "At most 100%."),
    claimBonus: z.number().int().min(0).max(10000).refine(wholeDollars, WHOLE_DOLLARS),
    claimBonusMonths: z.number().int().min(1, "At least 1 month.").max(24, "At most 24 months."),
    milestones: z
      .array(
        z.object({
          at: z.number().int().min(POINTS_PER_DOLLAR, `A milestone is at least ${POINTS_PER_DOLLAR} points.`).max(100_000, "A milestone is at most 100,000 points.").refine(wholeDollars, `Milestones are multiples of ${POINTS_PER_DOLLAR} points.`),
          bonus: z.number().int().min(POINTS_PER_DOLLAR, `A bonus is at least ${POINTS_PER_DOLLAR} points (S$1).`).max(10_000, "A bonus is at most 10,000 points.").refine(wholeDollars, WHOLE_DOLLARS),
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

/** Pure — the `site_settings` rows for saved settings. An unset launch date deletes its row. */
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
