import { describe, expect, it } from "vitest";
import { SEEDED_MILESTONES } from "../milestones";
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
      "1 point for every S$1 you pay for products, before GST",
      "Shipping doesn't earn points",
      "30 days after the order is delivered",
      "in steps of S$1, from S$5, up to half of the products' price",
      "Points can't be used on custom pillows",
      "Points used are not refunded. A return refunds money only, up to the money you paid on that order",
      "within 3 months of the email we sent you about it adds 1,000 points (S$10) to your account, once",
      "If you bought from us before our new website, we add points to your account once for what you spent then: 1 point for every S$1",
      "Your points stay in your account for as long as you have it",
      "Partner accounts neither earn nor use points",
      "can't be cashed out, transferred to anyone else, or bought",
      "30 days before we change these terms. A change never takes away points you already have",
    ]) {
      expect(t).toContain(rule);
    }
  });

  it("follows the settings", () => {
    const t = text({ ...POINTS_DEFAULTS, earnPerDollar: 4, minRedeem: 1000, maxShare: 0.3, claimBonus: 1500, claimBonusMonths: 1 });
    expect(t).toContain("4 points for every S$1");
    expect(t).toContain("from S$10, up to 30% of the products' price");
    expect(t).toContain("within 1 month of the email we sent you about it adds 1,500 points (S$15)");
  });

  it("lists the bonus milestones and their rules, and leaves them out when there are none", () => {
    const t = text({ ...POINTS_DEFAULTS, milestones: [...SEEDED_MILESTONES] });
    for (const rule of [
      "at 1,000 points earned, 100 points (S$1); at 2,500 points earned, 300 points (S$3); at 5,000 points earned, 800 points (S$8); at 10,000 points earned, 2,000 points (S$20).",
      "Only points earned on orders count towards a milestone",
      "points for past purchases and points we add for any other reason don't count",
      "Using points doesn't set you back",
      "the points we take back come off your total",
      "A bonus you've received is yours to keep",
      "Each milestone gives its bonus once",
    ]) {
      expect(t).toContain(rule);
    }
    expect(text()).not.toContain("Bonus milestones");
  });

  it("says points don't expire, with no expiry date or reminder", () => {
    const t = text({ ...POINTS_DEFAULTS, milestones: [...SEEDED_MILESTONES] });
    expect(t).toContain("Points don't expire");
    expect(t.match(/expir/gi)).toHaveLength(1);
    expect(t).not.toMatch(/remind/i);
  });

  it("leaves the signing-in bonus out when there is none", () => {
    expect(text({ ...POINTS_DEFAULTS, claimBonus: 0 })).not.toContain("Points for signing in");
  });

  it("says nothing of the old platform or a move", () => {
    expect(text()).not.toMatch(/shopify|moved|migrat|voucher/i);
  });
});

describe("the Welcome bonus and the flowers in the terms", () => {
  const ladder = [
    { until: "2026-12-01T00:00:00+08:00", points: 1000, allocation: 500 },
    { until: "2026-12-31T23:59:00+08:00", points: 600, allocation: 500 },
  ];
  const withLadder = pointsTermsSections(POINTS_DEFAULTS, ladder)
    .flatMap((x) => [x.heading, ...x.paragraphs])
    .join("\n");

  it("states each step in points, when it ends, and that the number is limited", () => {
    expect(withLadder).toContain("Welcome points");
    expect(withLadder).toContain("1,000 points until the end of 30 November");
    expect(withLadder).toContain("600 points until 23:59 on 31 December");
    expect(withLadder).toContain("limited number to give (500)");
  });

  it("says nothing of a Welcome bonus when there is no ladder", () => {
    expect(text()).not.toContain("Welcome points");
  });

  it("states the flower rule", () => {
    expect(text()).toContain("adds 1 to 3 points to your account, once for each flower each day, up to 500 points (S$5) in all");
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
