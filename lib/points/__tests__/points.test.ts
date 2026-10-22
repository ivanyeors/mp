import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_RETURN_WINDOW_DAYS } from "@/lib/rma/eligibility";
import { isPartnerMatch, type PartnerMatchRow } from "../partner";
import { claimBonusOffer } from "../offer";
import { POINTS_DEFAULTS, PointsSettingsSchema, pointsSettingsFromRows, pointsSettingsToRows } from "../settings";
import { POINTS_PER_DOLLAR, formatDollars, formatPoints, formatPointsCount, pointsToDollars } from "../value";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261021120000_points_ledger.sql"), "utf8");

describe("value (ADR 0030 a, b)", () => {
  it("is 100 points to S$1, shown in both", () => {
    expect(POINTS_PER_DOLLAR).toBe(100);
    expect(pointsToDollars(2130)).toBe(21.3);
    expect(formatPoints(2130)).toBe("2,130 points (S$21.30)");
    expect(formatPoints(1)).toBe("1 point (S$0.01)");
    expect(formatPointsCount(-500)).toBe("-500 points");
    expect(formatDollars(-5)).toBe("−S$5.00");
  });
});

describe("settings", () => {
  it("reads the seeded defaults, and a malformed value as its default", () => {
    expect(pointsSettingsFromRows([])).toEqual(POINTS_DEFAULTS);
    const s = pointsSettingsFromRows([
      { key: "points_enabled", value: "TRUE" },
      { key: "points_launch_at", value: "2026-11-01T00:00:00+08:00" },
      { key: "points_earn_per_dollar", value: "abc" },
      { key: "points_max_share", value: "1.5" },
      { key: "points_min_redeem", value: "700" },
    ]);
    expect(s).toMatchObject({ enabled: true, launchAt: "2026-10-31T16:00:00.000Z", earnPerDollar: 3, maxShare: 0.5, minRedeem: 700 });
  });

  it("seeds the same defaults in SQL, and no launch date", () => {
    for (const [key, value] of [
      ["points_enabled", "false"],
      ["points_earn_per_dollar", "3"],
      ["points_min_redeem", "500"],
      ["points_max_share", "0.5"],
      ["points_expiry_months", "24"],
      ["points_claim_bonus", "1000"],
      ["points_claim_bonus_months", "3"],
    ]) {
      expect(MIGRATION).toContain(`('${key}', '${value}')`);
    }
    expect(MIGRATION).not.toMatch(/\('points_launch_at'/);
  });

  it("refuses turning points on with no launch date, odd dollar amounts, and shares outside 0 to 100%", () => {
    const base = { ...POINTS_DEFAULTS, launchAt: "2026-11-01T00:00:00+08:00" };
    expect(PointsSettingsSchema.safeParse(base).success).toBe(true);
    expect(PointsSettingsSchema.safeParse({ ...base, enabled: true, launchAt: null }).success).toBe(false);
    expect(PointsSettingsSchema.safeParse({ ...base, minRedeem: 550 }).success).toBe(false);
    expect(PointsSettingsSchema.safeParse({ ...base, claimBonus: 1050 }).success).toBe(false);
    expect(PointsSettingsSchema.safeParse({ ...base, maxShare: 0 }).success).toBe(false);
    expect(PointsSettingsSchema.safeParse({ ...base, maxShare: 1.2 }).success).toBe(false);
  });

  it("writes every key, and deletes the launch date when it is cleared", () => {
    const withLaunch = pointsSettingsToRows({ ...POINTS_DEFAULTS, launchAt: "2026-11-01T00:00:00+08:00" });
    expect(withLaunch.upsert.map((r) => r.key)).toContain("points_launch_at");
    expect(withLaunch.remove).toEqual([]);
    expect(pointsSettingsToRows(POINTS_DEFAULTS).remove).toEqual(["points_launch_at"]);
  });
});

describe("the return window", () => {
  it("is the RMA window, in SQL too", () => {
    expect(DEFAULT_RETURN_WINDOW_DAYS).toBe(30);
    expect(MIGRATION.match(/interval '(\d+) days'/g)?.every((m) => m === `interval '${DEFAULT_RETURN_WINDOW_DAYS} days'`)).toBe(true);
  });
});

type PartnerCase = {
  name: string;
  customer: { email: string; signedUp: boolean };
  partner: { login: boolean; email: string; status: string; backup?: string; backupVerified?: boolean } | null;
  expected: boolean;
};
const CASES = JSON.parse(
  readFileSync(join(process.cwd(), "supabase/tests/loyalty-points/partner-cases.json"), "utf8"),
) as { cases: PartnerCase[] };

describe("isPartnerMatch: partner-cases.json (the same table is_partner_customer answers)", () => {
  it.each(CASES.cases.map((c) => [c.name, c] as const))("%s", (_n, c) => {
    const auth = c.customer.signedUp ? "auth-1" : null;
    const rows: PartnerMatchRow[] = c.partner
      ? [
          {
            auth_user_id: c.partner.login ? auth : null,
            email: c.partner.email,
            application_status: c.partner.status,
            backup_email: c.partner.backup ?? null,
            backup_email_verified: c.partner.backupVerified ?? false,
          },
        ]
      : [];
    expect(isPartnerMatch({ auth_user_id: auth, email: c.customer.email }, rows)).toBe(c.expected);
  });
});

describe("claimBonusOffer", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  const live = { ...POINTS_DEFAULTS, enabled: true, launchAt: "2026-11-01T00:00:00.000Z" };

  it("states the bonus once points are on, launched, and grant one", () => {
    expect(claimBonusOffer(live, now)).toEqual({ live: true, points: "1,000 points", amount: "S$10", months: 3 });
    expect(claimBonusOffer({ ...live, claimBonus: 1550 }, now)).toMatchObject({ points: "1,550 points", amount: "S$15.50" });
  });

  it.each([
    ["off", { enabled: false }, /off/],
    ["no launch date", { launchAt: null }, /no launch date/],
    ["launch still ahead", { launchAt: "2026-11-03T00:00:00.000Z" }, /not yet/],
    ["no bonus", { claimBonus: 0 }, /bonus is 0/],
    ["no window", { claimBonusMonths: 0 }, /0 months/],
  ])("promises nothing while %s", (_, over, reason) => {
    const offer = claimBonusOffer({ ...live, ...over }, now);
    expect(offer.live).toBe(false);
    if (!offer.live) expect(offer.reason).toMatch(reason);
  });
});
