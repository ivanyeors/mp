import { describe, expect, it } from "vitest";
import { POINTS_DEFAULTS, pointsLive } from "../settings";
import { pointsTermsSections } from "../terms";

/**
 * The points terms page (PRD-loyalty-points slice 08) states every rule the
 * slice lists, with the numbers the settings hold, and says nothing of the
 * old platform (owner, 2026-10-21).
 */

const text = (s = POINTS_DEFAULTS) =>
  pointsTermsSections(s)
    .flatMap((x) => [x.heading, ...x.paragraphs])
    .join("\n");

describe("pointsTermsSections", () => {
  it("states every rule, with the seeded numbers", () => {
    const t = text();
    for (const rule of [
      "100 points are worth S$1",
      "3 points for every S$1 you pay for products, before GST",
      "Shipping doesn't earn points",
      "30 days after the order is delivered",
      "in steps of S$1, from S$5, up to half of the products' price",
      "Points can't be used on custom pillows",
      "Points used are not refunded. A return refunds money only, up to the money you paid on that order",
      "within 3 months of the email we sent you about it adds 1,000 points (S$10) to your account, once",
      "Points expire 24 months after your last purchase",
      "3 months, 2 months and 1 month before",
      "Partner accounts neither earn nor use points",
      "can't be cashed out, transferred to anyone else, or bought",
      "30 days before we change these terms. A change never takes away points you already have",
    ]) {
      expect(t).toContain(rule);
    }
  });

  it("follows the settings", () => {
    const t = text({ ...POINTS_DEFAULTS, earnPerDollar: 5, minRedeem: 1000, maxShare: 0.3, expiryMonths: 12, claimBonus: 1500, claimBonusMonths: 1 });
    expect(t).toContain("5 points for every S$1");
    expect(t).toContain("from S$10, up to 30% of the products' price");
    expect(t).toContain("expire 12 months after your last purchase");
    expect(t).toContain("within 1 month of the email we sent you about it adds 1,500 points (S$15)");
  });

  it("leaves the signing-in bonus out when there is none", () => {
    expect(text({ ...POINTS_DEFAULTS, claimBonus: 0 })).not.toContain("Points for signing in");
  });

  it("says nothing of the old platform or a move", () => {
    expect(text()).not.toMatch(/shopify|moved|migrat|voucher/i);
  });
});

describe("pointsLive", () => {
  const now = new Date("2026-11-02T00:00:00Z");
  it("is on and launched", () => {
    expect(pointsLive({ enabled: true, launchAt: "2026-11-01T00:00:00Z" }, now)).toBe(true);
    expect(pointsLive({ enabled: true, launchAt: "2026-11-03T00:00:00Z" }, now)).toBe(false);
    expect(pointsLive({ enabled: true, launchAt: null }, now)).toBe(false);
    expect(pointsLive({ enabled: false, launchAt: "2026-11-01T00:00:00Z" }, now)).toBe(false);
  });
});
