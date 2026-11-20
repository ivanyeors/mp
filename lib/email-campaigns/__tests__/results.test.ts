import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HOLDOUT_MIN_SENT,
  HOLDOUT_PERCENT,
  NO_RESULTS,
  RESULT_WINDOW_DAYS,
  compareHoldout,
  formatRate,
  formatSgd,
  holdoutBlocker,
  holdoutVerdict,
  inHoldout,
  rate,
  resultsFromRows,
  type ResultNumbers,
} from "../results";
import { planCampaignWave, type CampaignCandidate } from "../rules";
import { holdoutBucketOf } from "./fake-db";

const MIGRATION = readFileSync(join(process.cwd(), "supabase/migrations/20261031162653_campaign_results.sql"), "utf8");

const row = (cohort: string, stage: string, over: Record<string, unknown> = {}) => ({
  campaign_id: "c",
  cohort,
  stage,
  people: 0,
  clicked: 0,
  unsubscribed: 0,
  complained: 0,
  bought: 0,
  bought_after_click: 0,
  bought_total: "0.00",
  counting: 0,
  ...over,
});
const numbers = (over: Partial<ResultNumbers>): ResultNumbers => ({ ...NO_RESULTS, ...over });

describe("the SQL and these constants agree", () => {
  it("holds 10% out, counts 30 days, and buckets by the md5 of the id", () => {
    expect(MIGRATION).toContain(`public.campaign_holdout_bucket(p_customer_id) < ${HOLDOUT_PERCENT} then`);
    expect(MIGRATION).toContain(`o.paid_at <= s.sent_at + interval '${RESULT_WINDOW_DAYS} days'`);
    expect(MIGRATION).toContain("(('x' || left(md5(p_customer_id::text), 8))::bit(32)::bigint % 100)::int");
    expect(holdoutBucketOf("00000000-0000-4000-8000-000000000001")).toBe(49);
    expect(holdoutBucketOf("11111111-0000-4000-8000-000000000001")).toBe(5);
    expect(holdoutBucketOf("11111111-0000-4000-8000-000000000002")).toBe(38);
  });

  it("counts a purchase as the CRM does: a counted Order with a goods line, net of refunds", () => {
    expect(MIGRATION).toContain("o.status not in ('pending', 'cancelled', 'refunded', 'payment_failed')");
    expect(MIGRATION).toContain("i.kind = 'goods'");
    expect(MIGRATION).toContain("greatest(o.total - coalesce(o.amount_refunded, 0), 0)");
  });
});

describe("rates", () => {
  it("are over people sent, and a dash when nobody was, never 0%", () => {
    expect(rate(31, 240)).toBeCloseTo(0.129, 3);
    expect(rate(0, 0)).toBeNull();
    expect(formatRate(rate(0, 0))).toBe("—");
    expect(formatRate(rate(0, 240))).toBe("0%");
    expect(formatRate(rate(31, 240))).toBe("13%");
    expect(formatRate(rate(9, 240))).toBe("3.8%");
    expect(formatRate(rate(2, 200))).toBe("1%");
  });

  it("formats money as the demo reads", () => {
    expect(formatSgd(2140.4)).toBe("S$2,140");
    expect(formatSgd(0)).toBe("S$0");
  });
});

describe("the results", () => {
  it("total the people sent, and split them by stage in funnel order", () => {
    const r = resultsFromRows([
      row("sent", "loyal", { people: 60, clicked: 12, bought: 4, bought_after_click: 2, bought_total: "980.00", counting: 10 }),
      row("sent", "new", { people: 140, clicked: 15, unsubscribed: 1, bought: 3, bought_total: "760.50" }),
      row("sent", "unknown", { people: 40, clicked: 4, unsubscribed: 1, bought: 2, bought_total: 399.5 }),
      row("sent", "at_risk", { people: 0 }),
      row("sent", "churned", { people: 9 }),
      row("later", "new", { people: 9 }),
    ]);
    expect(r.total).toEqual({
      people: 240,
      clicked: 31,
      unsubscribed: 2,
      complained: 0,
      bought: 9,
      boughtAfterClick: 2,
      boughtTotal: 2140,
      counting: 10,
    });
    expect(r.byStage.map((s) => [s.stage, s.people])).toEqual([
      ["new", 140],
      ["loyal", 60],
      ["unknown", 40],
    ]);
    expect(r.holdout).toBeNull();
  });

  it("set the held out beside the people sent since the holdout began", () => {
    const r = resultsFromRows([
      row("sent", "lead", { people: 500, bought: 30 }),
      row("held_out", "lead", { people: 24, bought: 1, bought_total: 120 }),
      row("sent_since_holdout", "lead", { people: 216, bought: 9 }),
    ]);
    expect(r.total.people).toBe(500);
    expect(r.holdout?.heldOut).toMatchObject({ people: 24, bought: 1, boughtTotal: 120 });
    expect(r.holdout?.sent).toMatchObject({ people: 216, bought: 9 });
  });
});

describe("the holdout comparison", () => {
  it("calls a small difference unclear, and a large one clear", () => {
    const close = compareHoldout(numbers({ people: 24, bought: 1 }), numbers({ people: 216, bought: 9 }));
    expect(close.difference).toBe(0);
    expect(close.clear).toBe(false);
    expect(holdoutVerdict(close)).toMatch(/^Too close to call/);

    const big = compareHoldout(numbers({ people: 1000, bought: 20 }), numbers({ people: 9000, bought: 450 }));
    expect(big.difference).toBe(3);
    expect(big.clear).toBe(true);
    expect(holdoutVerdict(big)).toBe("People sent it bought more than those held out, by more than chance explains.");

    const worse = compareHoldout(numbers({ people: 1000, bought: 80 }), numbers({ people: 9000, bought: 270 }));
    expect(worse.clear).toBe(true);
    expect(holdoutVerdict(worse)).toMatch(/^People held out bought more/);
  });

  it("has nothing to compare before anyone is sent beside the held out", () => {
    const none = compareHoldout(numbers({ people: 3, bought: 0 }), NO_RESULTS);
    expect(none).toMatchObject({ difference: null, clear: false });
    expect(holdoutVerdict(none)).toMatch(/nothing to compare yet/);
    expect(compareHoldout(numbers({ people: 50 }), numbers({ people: 450 })).clear).toBe(false);
  });

  it("is offered to a campaign that keeps sending, from 500 sent", () => {
    expect(holdoutBlocker({ keepSending: false }, 900)).toMatch(/keeps sending/);
    expect(holdoutBlocker({ keepSending: true }, HOLDOUT_MIN_SENT - 1)).toMatch(/^A holdout is offered once 500 people have been sent it \(499 so far\)/);
    expect(holdoutBlocker({ keepSending: true }, HOLDOUT_MIN_SENT)).toBeNull();
  });

  it("holds out a bucket under 10", () => {
    expect([0, 9, 10, 99, null, undefined, -1].map(inHoldout)).toEqual([true, true, false, false, false, false, false]);
  });
});

describe("the plan says who the holdout keeps back", () => {
  const candidate = (n: number): CampaignCandidate => ({
    customerId: `c${n}`,
    email: `c${n}@x.test`,
    firstName: null,
    marketingEmail: "subscribed",
    migrated: false,
    claimedAt: null,
    ordersCount: 0,
    since: `2026-0${n}-01T00:00:00Z`,
    suppressed: false,
    own: null,
    locale: "en-US",
    holdoutBucket: n * 4,
  });
  const people = [1, 2, 3, 4, 5].map(candidate);

  it("counts the wave's people in the bucket, only with a holdout", () => {
    expect(planCampaignWave("subscribed", people, { size: 5, holdout: true }).heldOut).toBe(2);
    expect(planCampaignWave("subscribed", people, { size: 5 }).heldOut).toBe(0);
    expect(planCampaignWave("subscribed", people, { size: 3, holdout: true }).heldOut).toBe(0);
  });

  it("leaves out someone already held out, for good, and never counts them as sent", () => {
    const held = { ...candidate(1), own: { status: "held_out" as const, wave: "daily-2026-11-01", sentAt: "2026-11-01T02:00:00Z" } };
    const plan = planCampaignWave("subscribed", [held, candidate(2)], { size: 5, retryFailed: false });
    expect(plan.excluded).toEqual({ held_out: 1 });
    expect(plan.alreadySent).toBe(0);
    expect(planCampaignWave("subscribed", [held], { size: 5, retryFailed: true }).excluded).toEqual({ held_out: 1 });
  });
});
