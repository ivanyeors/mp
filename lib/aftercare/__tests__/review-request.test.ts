import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideAftercareEmail,
  isAftercareEmailAllowed,
  isProductionDeploy,
} from "@/lib/aftercare/channels";
import {
  dueWindow,
  isUsableReviewUrl,
  parseReviewRequestSettings,
  planReviewChannels,
  reviewProductLabel,
  reviewRequestBlock,
  reviewRequestTiming,
  REVIEW_ORDER_SELECT,
  selectReviewRequestCandidates,
  type ReviewOrderRow,
} from "@/lib/aftercare/review-request";
import { applyAftercareSettingsPatch, parseAftercareSettings } from "@/lib/aftercare/settings";

/**
 * The Review request's pure rules (CRM slice 07): the timing, who is a
 * candidate, and each channel's decision.
 */

const DAYS = { daysAfter: 14, maxAgeDays: 60 };
/** 10:00 SGT on a given Singapore day. */
const sgt10 = (ymd: string) => new Date(`${ymd}T10:00:00+08:00`);

describe("the timing rule, in Singapore calendar days", () => {
  const delivered = "2026-10-01T06:00:00.000Z"; // 1 Oct, 14:00 SGT

  it("is too early before day 14", () => {
    expect(reviewRequestTiming({ deliveredAt: delivered, now: sgt10("2026-10-14"), ...DAYS })).toEqual({
      due: false,
      reason: "too_early",
    });
  });

  it("is due on day 14, whatever the hour of delivery", () => {
    expect(reviewRequestTiming({ deliveredAt: delivered, now: sgt10("2026-10-15"), ...DAYS })).toEqual({
      due: true,
      deliveredOn: "2026-10-01",
    });
    // Delivered late in the evening: the same calendar day counts.
    const late = "2026-10-01T15:30:00.000Z"; // 1 Oct, 23:30 SGT
    expect(reviewRequestTiming({ deliveredAt: late, now: new Date("2026-10-15T00:00:00+08:00"), ...DAYS }).due).toBe(true);
  });

  it("is still due on the last day, and too old the day after", () => {
    expect(reviewRequestTiming({ deliveredAt: delivered, now: sgt10("2026-11-30"), ...DAYS }).due).toBe(true);
    expect(reviewRequestTiming({ deliveredAt: delivered, now: sgt10("2026-12-01"), ...DAYS })).toEqual({
      due: false,
      reason: "too_old",
    });
  });

  it("is never due while the Order is not marked delivered", () => {
    expect(reviewRequestTiming({ deliveredAt: null, now: sgt10("2026-12-01"), ...DAYS })).toEqual({
      due: false,
      reason: "not_delivered",
    });
    expect(reviewRequestTiming({ deliveredAt: "not a date", now: sgt10("2026-12-01"), ...DAYS }).due).toBe(false);
  });

  it("times an in-store handover from the handover, which sets delivered_at", () => {
    const handover = "2026-10-05T04:00:00.000Z"; // paid and handed over at once
    expect(reviewRequestTiming({ deliveredAt: handover, now: sgt10("2026-10-18"), ...DAYS }).due).toBe(false);
    expect(reviewRequestTiming({ deliveredAt: handover, now: sgt10("2026-10-19"), ...DAYS }).due).toBe(true);
  });

  it("turns over at midnight SGT, not midnight UTC", () => {
    // Delivered 2 Oct 00:30 SGT, which is still 1 Oct in UTC.
    const justAfterMidnight = "2026-10-01T16:30:00.000Z";
    expect(
      reviewRequestTiming({ deliveredAt: justAfterMidnight, now: new Date("2026-10-15T15:59:00.000Z"), ...DAYS }),
    ).toEqual({ due: false, reason: "too_early" }); // 15 Oct 23:59 SGT
    expect(
      reviewRequestTiming({ deliveredAt: justAfterMidnight, now: new Date("2026-10-15T16:00:00.000Z"), ...DAYS }),
    ).toEqual({ due: true, deliveredOn: "2026-10-02" }); // 16 Oct 00:00 SGT
  });

  it("pre-filters the database on exactly the instants whose day can be due", () => {
    const w = dueWindow({ now: sgt10("2026-10-20"), ...DAYS });
    // Due today: delivered 21 Aug (60 days) through 6 Oct (14 days), SGT.
    expect(w).toEqual({ from: "2026-08-20T16:00:00.000Z", to: "2026-10-06T16:00:00.000Z" });
    for (const at of [w.from, "2026-10-06T15:59:59.000Z"]) {
      expect(reviewRequestTiming({ deliveredAt: at, now: sgt10("2026-10-20"), ...DAYS }).due).toBe(true);
    }
    for (const at of ["2026-08-20T15:59:59.000Z", w.to]) {
      expect(reviewRequestTiming({ deliveredAt: at, now: sgt10("2026-10-20"), ...DAYS }).due).toBe(false);
    }
  });
});

describe("settings", () => {
  it("defaults to off, 14 and 60, with no link", () => {
    expect(parseReviewRequestSettings({})).toEqual({ enabled: false, daysAfter: 14, maxAgeDays: 60, googleReviewUrl: "" });
  });

  it("reads the seeded values, and ignores malformed numbers", () => {
    expect(
      parseReviewRequestSettings({
        review_requests_enabled: "TRUE ",
        review_request_days_after: "10",
        review_request_max_age_days: "abc",
        google_review_url: " https://g.page/r/CfdGhvgB1hwUEBM/review ",
      }),
    ).toEqual({ enabled: true, daysAfter: 10, maxAgeDays: 60, googleReviewUrl: "https://g.page/r/CfdGhvgB1hwUEBM/review" });
    expect(parseReviewRequestSettings({ review_request_days_after: "0" }).daysAfter).toBe(14);
    expect(parseReviewRequestSettings({ review_request_days_after: "20", review_request_max_age_days: "5" }).maxAgeDays).toBe(20);
  });

  it("blocks sending while off, or without an https link", () => {
    const on = { enabled: true, daysAfter: 14, maxAgeDays: 60, googleReviewUrl: "https://g.page/r/x/review" };
    expect(reviewRequestBlock(on)).toBeNull();
    expect(reviewRequestBlock({ ...on, enabled: false })).toBe("disabled");
    expect(reviewRequestBlock({ ...on, googleReviewUrl: "" })).toBe("no_review_url");
    expect(reviewRequestBlock({ ...on, googleReviewUrl: "http://g.page/r/x/review" })).toBe("no_review_url");
    expect(isUsableReviewUrl("javascript:alert(1)")).toBe(false);
    expect(isUsableReviewUrl("g.page/r/x")).toBe(false);
  });

  it("refuses a link that is not https, and a window that ends before it starts", () => {
    const current = parseAftercareSettings({ google_review_url: "https://g.page/r/x/review" });
    expect(applyAftercareSettingsPatch(current, { google_review_url: "http://example.com" })).toEqual({
      ok: false,
      error: "The Google review link must be a full https:// address.",
    });
    expect(applyAftercareSettingsPatch(current, { review_request_max_age_days: 10 }).ok).toBe(false);
    // An empty link is allowed: it stops sending.
    const cleared = applyAftercareSettingsPatch(current, { google_review_url: "" });
    expect(cleared).toMatchObject({ ok: true, rows: [{ key: "google_review_url", value: "" }] });
  });

  it("writes only the keys that changed", () => {
    const change = applyAftercareSettingsPatch(parseAftercareSettings({}), {
      review_requests_enabled: true,
      review_request_days_after: 21,
    });
    expect(change).toEqual({
      ok: true,
      next: { reviewRequests: { enabled: true, daysAfter: 21, maxAgeDays: 60, googleReviewUrl: "" } },
      rows: [
        { key: "review_requests_enabled", value: "true" },
        { key: "review_request_days_after", value: "21" },
      ],
    });
  });
});

const NOW = sgt10("2026-10-20");
const order = (o: Partial<ReviewOrderRow> & { id: string }): ReviewOrderRow => ({
  order_number: `MP-${o.id}`,
  customer_id: "c1",
  email: "c1@x.test",
  status: "delivered",
  paid_at: "2026-09-20T02:00:00.000Z",
  delivered_at: "2026-10-01T02:00:00.000Z",
  order_items: [{ id: `${o.id}-1`, kind: "goods", quantity: 1, product_title: "Mpillow", variant_title: null, image_url: null }],
  ...o,
});

describe("who is a candidate", () => {
  const select = (orders: ReviewOrderRow[], asked: string[] = []) =>
    selectReviewRequestCandidates({ orders, asked: new Set(asked), now: NOW, settings: DAYS });

  it("is one entry per Customer, across many Orders: their latest delivered Order that is due", () => {
    const { candidates } = select([
      order({ id: "o1", delivered_at: "2026-09-01T02:00:00.000Z" }),
      order({ id: "o2", delivered_at: "2026-10-03T02:00:00.000Z" }),
      order({ id: "o3", delivered_at: "2026-10-15T02:00:00.000Z" }), // not due yet
      order({ id: "o4", customer_id: "c2", delivered_at: "2026-09-10T02:00:00.000Z" }),
    ]);
    expect(candidates.map((c) => [c.customerId, c.order.id])).toEqual([
      ["c2", "o4"],
      ["c1", "o2"],
    ]);
  });

  it("never includes a Customer who was asked before, whatever they bought since", () => {
    expect(select([order({ id: "o1" })], ["c1"])).toEqual({ candidates: [], alreadyAsked: 1 });
  });

  it("counts only paid Orders whose money stayed, with a goods line and a Customer", () => {
    const { candidates } = select([
      order({ id: "pending", customer_id: "a", status: "pending" }),
      order({ id: "cancelled", customer_id: "b", status: "cancelled" }),
      order({ id: "refunded", customer_id: "c", status: "refunded" }),
      order({ id: "failed", customer_id: "d", status: "payment_failed" }),
      order({ id: "unpaid", customer_id: "e", paid_at: null }),
      order({
        id: "service",
        customer_id: "f",
        order_items: [{ id: "s", kind: "service", quantity: 1, product_title: "Re-adjustment", variant_title: null, image_url: null }],
      }),
      order({ id: "guest", customer_id: null }),
      order({ id: "partial", customer_id: "g", status: "partially_refunded" }),
      order({ id: "shipped", customer_id: "h", status: "shipped" }),
    ]);
    expect(candidates.map((c) => c.order.id)).toEqual(["partial", "shipped"]);
  });

  it("does not read how a customer feels: the order query names no return, refund request, rating or note", () => {
    for (const word of ["refund", "return", "rating", "review", "note", "tags", "rma", "dispute"]) {
      expect(REVIEW_ORDER_SELECT.toLowerCase(), word).not.toContain(word);
    }
    // And the job reads none of those tables or columns (its code, not its comments).
    const src = ["review-request.ts", "review-request-server.ts"]
      .map((f) => readFileSync(join(process.cwd(), "lib/aftercare", f), "utf8"))
      .join("\n")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    for (const table of ["rma_requests", "rma_status_events", "product_reviews", "google_reviews", "customer_google_reviews", "customer_notes"]) {
      expect(src, table).not.toMatch(new RegExp(`from\\(["']${table}["']\\)`));
    }
    expect(src).not.toMatch(/refund_request_status|returned_quantity|amount_refunded|internal_notes/);
  });
});

describe("the product the message names", () => {
  const pillows = new Map([
    [1, { size: "M", kind: "premium" }],
    [2, { size: "S", kind: "basic" }],
  ]);
  const line = (id: string, extra: Record<string, unknown>) => ({
    id,
    kind: "goods",
    quantity: 1,
    product_title: "Title",
    variant_title: null,
    image_url: null,
    ...extra,
  });

  it("is the tier's name without the size, joined when there are two", () => {
    expect(reviewProductLabel([line("a", { product_variants: { pillow_product_id: 1, products: { product_type: "pillow" } } })], pillows)).toBe(
      "Premium Mpillow",
    );
    expect(
      reviewProductLabel(
        [
          line("a", { product_variants: { pillow_product_id: 1, products: { product_type: "pillow" } } }),
          line("b", { product_variants: { option1: "Long", products: { product_type: "bolster" } } }),
        ],
        pillows,
      ),
    ).toBe("Premium Mpillow and Mbolster");
  });

  it("falls back to the goods' titles for accessories", () => {
    expect(reviewProductLabel([line("a", { product_title: "Bamboo Pillow Case" })], pillows)).toBe("Bamboo Pillow Case");
  });
});

describe("the channels", () => {
  const allowAll = () => true;

  it("email goes while the switch is on and there is an address", () => {
    expect(decideAftercareEmail({ optedIn: true, email: " a@x.test ", allowed: allowAll })).toEqual({ send: true, to: "a@x.test" });
    expect(decideAftercareEmail({ optedIn: null, email: "a@x.test", allowed: allowAll }).send).toBe(true);
    expect(decideAftercareEmail({ optedIn: false, email: "a@x.test", allowed: allowAll })).toEqual({ send: false, skip: "opted_out" });
    expect(decideAftercareEmail({ optedIn: true, email: "", allowed: allowAll })).toEqual({ send: false, skip: "no_email" });
    expect(decideAftercareEmail({ optedIn: true, email: "a@x.test", allowed: () => false })).toEqual({
      send: false,
      skip: "not_allowed_outside_production",
    });
  });

  it("outside production, email goes only to the allowlist; an empty list allows nobody", () => {
    expect(isProductionDeploy({ VERCEL_ENV: "production", NODE_ENV: "production" })).toBe(true);
    expect(isProductionDeploy({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(false);
    expect(isProductionDeploy({ NODE_ENV: "development" })).toBe(false);
    const preview = { VERCEL_ENV: "preview", AFTERCARE_EMAIL_ALLOWLIST: "Owner@x.test, qa@x.test" };
    expect(isAftercareEmailAllowed("owner@x.test", preview)).toBe(true);
    expect(isAftercareEmailAllowed("customer@x.test", preview)).toBe(false);
    expect(isAftercareEmailAllowed("owner@x.test", { VERCEL_ENV: "preview" })).toBe(false);
    expect(isAftercareEmailAllowed("customer@x.test", { VERCEL_ENV: "production" })).toBe(true);
  });

  it("email off and WhatsApp on is WhatsApp only, and the reverse; neither is no channel", () => {
    const emailOn = { send: true, to: "a@x.test" } as const;
    const emailOff = { send: false, skip: "opted_out" } as const;
    const waOn = { send: true, e164: "+6591234567", templateName: "aftercare_review_request" } as const;
    const waOff = { send: false, skip: "opted_out" } as const;
    expect(planReviewChannels(emailOff, waOn)).toMatchObject({ email: { send: false }, whatsapp: { send: true }, any: true });
    expect(planReviewChannels(emailOn, waOff)).toMatchObject({ email: { send: true }, whatsapp: { send: false }, any: true });
    expect(planReviewChannels(emailOff, waOff).any).toBe(false);
  });
});
