import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";

/**
 * The one code field on a customisation (ADR 0033). A discount code is checked
 * at hold and taken off the authorised total; the Result keeps the coupon's
 * terms for every later repricing. A referral code attributes and discounts
 * nothing. A code nobody recognises never blocks the hold; a discount code that
 * cannot be used on this build does, before any Checkout exists.
 * Same in-memory harness as live-shipping.test.ts, with the code resolver and
 * the coupon check stubbed: their own rules are tested in
 * app/api/checkout/code/__tests__.
 */

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  createHoldCheckout: vi.fn(),
  sendEmail: vi.fn(),
  total: 200,
  fetch: vi.fn(),
  adminCtx: null as null | { userId: string; email: string; memberId: string },
  workingAs: null as null | { id: string; name: string },
  method: { slug: "standard" } as Record<string, unknown>,
  quoteShippingMethods: vi.fn(),
  resolveCheckoutCode: vi.fn(),
  checkCoupon: vi.fn(),
  rateLimited: false,
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      let op: "select" | "update" | "insert" | "delete" = "select";
      let payload: Record<string, unknown> = {};
      const run = () => {
        if (table === "items") {
          return [{ id: 1, category: "cover", name: "Cover" }, { id: 2, category: "case", name: "Case" }];
        }
        if (table !== "mp_config_responses") return [];
        if (op === "insert") {
          h.rows.set(payload.id as string, { ...payload });
          return [{ ...payload }];
        }
        const hit = [...h.rows.values()].filter((r) => filters.every(([c, v]) => (r[c] ?? null) === v));
        for (const r of hit) {
          if (op === "delete") h.rows.delete(r.id as string);
          if (op === "update") h.rows.set(r.id as string, { ...r, ...payload });
        }
        return hit.map((r) => ({ ...r }));
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push([c, v]), b),
        is: (c: string, v: unknown) => (filters.push([c, v]), b),
        in: () => b,
        delete: () => ((op = "delete"), b),
        update: (p: Record<string, unknown>) => ((op = "update"), (payload = p), b),
        insert: (p: Record<string, unknown>) => ((op = "insert"), (payload = p), b),
        upsert: async (row: Record<string, unknown>) => {
          const id = row.id as string;
          h.rows.set(id, { ...h.rows.get(id), ...row });
          return { error: null };
        },
        maybeSingle: async () => {
          if (table === "shipping_methods") return { data: h.method, error: null };
          const [row] = run();
          return { data: row ?? null, error: null };
        },
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/auth/user", () => ({ getAuthUser: h.getAuthUser }));
vi.mock("@/lib/auth/admin", () => ({
  requireAnyAdmin: h.requireAnyAdmin,
  getAdminContext: vi.fn(async () => h.adminCtx),
}));
vi.mock("@/lib/staff/working-as", () => ({
  getWorkingAs: vi.fn(async () => h.workingAs),
  actingProfile: vi.fn(async () => h.workingAs),
}));
vi.mock("@/lib/authorization-hold", () => ({ createHoldCheckout: h.createHoldCheckout }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ send: h.sendEmail }) }));
vi.mock("@/lib/email/transport", () => ({ getDefaultFromAddress: () => "from@x.test" }));
vi.mock("@/lib/email/results", async (orig) => ({
  RESULT_EMAIL_COPY: (await orig<typeof import("@/lib/email/results")>()).RESULT_EMAIL_COPY,
  renderResultHeldEmail: () => ({ subject: "held", html: "", text: "" }),
}));
vi.mock("@/lib/discovery-source", () => ({
  getDiscoverySourceCatalog: vi.fn().mockResolvedValue([]),
  validateDiscoverySource: () => null,
  normalizeDiscoverySourceOther: () => null,
}));
vi.mock("@/lib/results/composed-sellable", () => ({
  BOLSTER_LENGTHS: ["short", "medium", "long"],
  loadComposedSellable: vi.fn().mockResolvedValue({
    ok: true,
    sellable: { currency: "SGD", msrpByFamily: {}, defaultCover: null, defaultCase: null, caseOptions: [] },
  }),
}));
vi.mock("@/lib/pricing/composed-price", () => ({
  placedChargeLines: () => [],
  resolvePreferences: () => ({ chosenCover: null, chosenCase: null }),
  priceComposedBuild: () => ({ ok: true, subtotal: 200 }),
}));
vi.mock("@/lib/shop/customization-inventory", () => ({
  isCaseInventoryCategory: () => false,
  isProtectorInventoryCategory: () => false,
  itemMatchesPreferenceRole: () => true,
}));
vi.mock("@/lib/shipping/quote", async (orig) => ({
  ...(await orig<typeof import("@/lib/shipping/quote")>()),
  quoteShippingMethods: h.quoteShippingMethods,
}));
vi.mock("@/lib/shipping/settings", () => ({
  readShippingSettings: async () => ({ estimate_declared_value: 150 }),
}));
vi.mock("@/lib/ecommerce/tax", () => ({
  resolveTaxRuleForRegion: vi.fn().mockResolvedValue(null),
  computeTax: () => ({ taxAmount: 0 }),
}));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/sla-reminders", () => ({
  SLA_SETTING_KEYS: [],
  parseSlaSettings: () => ({ authHoldEnabled: true }),
}));
vi.mock("@/lib/configurator/pre-order-persist", () => ({
  loadPreOrderTriggerAtHold: vi.fn().mockResolvedValue(null),
  preOrderFlagForResult: () => false,
}));
vi.mock("@/lib/referrals", () => ({
  getPartnerByReferralCode: vi.fn().mockResolvedValue(null),
  isSelfReferral: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/lib/checkout-code", () => ({
  CHECKOUT_CODE_MAX_LENGTH: 64,
  CHECKOUT_CODE_RATE_LIMITED_MESSAGE: "Too many code attempts.",
  checkoutCodeRateLimited: () => h.rateLimited,
  couponAccount: async () => null,
  resolveCheckoutCode: h.resolveCheckoutCode,
}));
vi.mock("@/lib/ecommerce/discounts", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/discounts")>()),
  checkCoupon: h.checkCoupon,
}));
vi.mock("@/lib/rules-engine", () => ({
  assertPreStripeRouteResolved: () => ({ ok: true }),
  inputsFromBolsterHeight: vi.fn(),
  inputsFromMpConfigData: vi.fn(),
  parseRecommendationRecord: () => ({}),
  recommendWithEngine: vi.fn(),
  toPersistedRecommendationRecord: vi.fn(),
}));

const { POST } = await import("@/app/api/results/hold/route");

const ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TOKEN = "11111111-1111-4111-8111-111111111111";

const draft = {
  id: ID,
  status: null,
  source: null,
  access_token: TOKEN,
  customer_id: null,
  customer_email: null,
  payment_intent_id: null,
  order_id: null,
  measured_by_type: "by_user",
  measured_by_staff_id: null,
};

/** Flat S$10, so the arithmetic is the discount's alone. Goods are stubbed at 200. */
const FLAT = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  slug: "standard",
  rate_source: "flat",
  base_rate: 10,
  free_above: null,
  currency: "SGD",
  countries: ["SG"],
};

/** A partner on the Schedule's S$50 pool, taking all of it, no customer discount. */
const partnerTerms = { pool: 50, choice: null, nextChoice: null, nextChoiceFrom: null, customerDiscount: false };

const coupon = (over: Record<string, unknown> = {}) => ({
  id: "coupon-10",
  code: "SAVE10",
  discount_type: "percentage",
  discount_value: 10,
  max_discount: null,
  currency: "SGD",
  min_order_amount: null,
  usage_limit: null,
  usage_count: 0,
  per_customer_limit: null,
  starts_at: null,
  expires_at: null,
  applies_to: null,
  is_active: true,
  ...over,
});

const post = (extra: Record<string, unknown> = {}) =>
  POST(
    new Request("https://x.test/api/results/hold", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        responseId: ID,
        token: TOKEN,
        email: "owner@x.test",
        phone: "91234567",
        discoverySource: "instagram",
        suggestedSize: "M",
        suggestedTier: "premium",
        preferenceLines: [
          { item_id: 1, quantity: 1, category: "cover" },
          { item_id: 2, quantity: 1, category: "case" },
        ],
        shippingMethodId: FLAT.id,
        shippingAddress: {
          recipient: "Ada",
          line1: "1 Road",
          city: "Singapore",
          postal_code: "123456",
          country: "SG",
        },
        recommendationRecord: {},
        ...extra,
      }),
    }),
  );

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  h.rows.clear();
  h.rows.set(ID, { ...draft });
  h.adminCtx = null;
  h.workingAs = null;
  h.rateLimited = false;
  h.method = { ...FLAT };
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.fetch.mockResolvedValue(new Response("{}"));
  h.resolveCheckoutCode.mockResolvedValue(null);
  h.checkCoupon.mockImplementation(async (c: { discount_value: number }) => ({
    valid: true,
    coupon: c,
    discount_amount: 20,
  }));
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});

describe("POST /api/results/hold — the code field", () => {
  it("takes a discount code off the goods and authorises the discounted total", async () => {
    h.resolveCheckoutCode.mockResolvedValue({ kind: "coupon", coupon: coupon() });
    const res = await post({ code: "save10" });
    expect(res.status).toBe(200);
    const row = h.rows.get(ID)!;
    // Goods 200 − 10% + flat shipping 10.
    expect(row.authorized_amount).toBe(190);
    expect(h.createHoldCheckout.mock.calls[0][0].amount).toBe(190);
    expect(row).toMatchObject({
      coupon_id: "coupon-10",
      coupon_code: "SAVE10",
      coupon_terms: { discount_type: "percentage", discount_value: 10, max_discount: null },
    });
  });

  it("checks the coupon on this build's goods, for this email, not counting this Result", async () => {
    h.resolveCheckoutCode.mockResolvedValue({ kind: "coupon", coupon: coupon() });
    await post({ code: "SAVE10" });
    const [, goods, , , opts] = h.checkCoupon.mock.calls[0];
    expect(goods).toBe(200);
    expect(opts).toMatchObject({ customerEmail: "owner@x.test", excludeResultIds: [ID] });
  });

  it("charges no shipping for a free-shipping code", async () => {
    h.resolveCheckoutCode.mockResolvedValue({
      kind: "coupon",
      coupon: coupon({ code: "SHIPFREE", discount_type: "free_shipping", discount_value: 1 }),
    });
    await post({ code: "SHIPFREE" });
    expect(h.rows.get(ID)!.authorized_amount).toBe(200);
  });

  it("refuses a discount code that cannot be used, before any Checkout exists", async () => {
    h.resolveCheckoutCode.mockResolvedValue({ kind: "coupon", coupon: coupon() });
    h.checkCoupon.mockResolvedValue({ valid: false, error: "This code has expired" });
    const res = await post({ code: "SAVE10" });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "This code has expired", field: "code" });
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
    expect(h.rows.get(ID)!.status).toBeNull();
  });

  it("never blocks on a code nobody recognises, and charges full price", async () => {
    h.resolveCheckoutCode.mockResolvedValue({ kind: "unknown" });
    const res = await post({ code: "NOPE" });
    expect(res.status).toBe(200);
    const row = h.rows.get(ID)!;
    expect(row.authorized_amount).toBe(210);
    expect(row).toMatchObject({ coupon_id: null, coupon_code: null, coupon_terms: null });
  });

  it("attributes a referral code and takes nothing off", async () => {
    h.resolveCheckoutCode.mockResolvedValue({
      kind: "referral",
      partner: { id: "partner-1", name: "Spine Clinic", referral_code: "ABCD2345", terms: partnerTerms },
    });
    await post({ code: "abcd2345" });
    const row = h.rows.get(ID)!;
    expect(row).toMatchObject({
      partner_id: "partner-1",
      ref_code: "ABCD2345",
      attribution_source: "typed",
      coupon_id: null,
      authorized_amount: 210,
    });
    expect(h.checkCoupon).not.toHaveBeenCalled();
  });

  it("a discount code ignores a referral sent in the old referralCode field (one code per order)", async () => {
    const { getPartnerByReferralCode } = await import("@/lib/referrals");
    vi.mocked(getPartnerByReferralCode).mockResolvedValue({ id: "partner-1", name: "Spine Clinic", referral_code: "ABCD2345", terms: partnerTerms });
    h.resolveCheckoutCode.mockResolvedValue({ kind: "coupon", coupon: coupon() });
    await post({ code: "SAVE10", referralCode: "ABCD2345" });
    expect(h.rows.get(ID)).toMatchObject({ coupon_id: "coupon-10", partner_id: null, ref_code: null, authorized_amount: 190 });
    vi.mocked(getPartnerByReferralCode).mockResolvedValue(null);
  });

  it("clears a code a re-submit dropped", async () => {
    h.rows.set(ID, { ...draft, coupon_id: "coupon-10", coupon_code: "SAVE10", coupon_terms: { discount_type: "percentage", discount_value: 10, max_discount: null } });
    await post();
    expect(h.rows.get(ID)).toMatchObject({ coupon_id: null, coupon_code: null, coupon_terms: null, authorized_amount: 210 });
  });

  it("draws a typed code from the same guessing allowance as the check endpoint", async () => {
    h.rateLimited = true;
    const res = await post({ code: "GUESS" });
    expect(res.status).toBe(429);
    expect(h.resolveCheckoutCode).not.toHaveBeenCalled();
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
  });
});
