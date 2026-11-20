import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import type { PartnerTerms } from "@/lib/partner-terms";

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
  getPartnerByReferralCode: vi.fn(),
  isSelfReferral: vi.fn(),
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
  getPartnerByReferralCode: h.getPartnerByReferralCode,
  isSelfReferral: h.isSelfReferral,
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

const FLAT = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  slug: "standard",
  rate_source: "flat",
  base_rate: 10,
  free_above: null,
  currency: "SGD",
  countries: ["SG"],
};

const terms = (over: Partial<PartnerTerms> = {}): PartnerTerms => ({
  pool: 50,
  choice: 30,
  nextChoice: null,
  nextChoiceFrom: null,
  customerDiscount: true,
  ...over,
});
const partner = (t: PartnerTerms) => ({ id: "partner-1", name: "Spine Clinic", referral_code: "ABCD2345", terms: t });

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

async function hold(extra: Record<string, unknown> = {}) {
  h.rows.clear();
  h.rows.set(ID, { ...draft });
  const res = await post(extra);
  expect(res.status, JSON.stringify(await res.clone().json().catch(() => null))).toBe(200);
  return h.rows.get(ID)!;
}

async function fullPrice(extra: Record<string, unknown> = {}) {
  const saved = h.resolveCheckoutCode.getMockImplementation();
  h.resolveCheckoutCode.mockResolvedValue(null);
  const row = await hold(extra);
  if (saved) h.resolveCheckoutCode.mockImplementation(saved);
  return row.authorized_amount as number;
}

const typedPartner = (t: PartnerTerms) =>
  h.resolveCheckoutCode.mockResolvedValue({ kind: "referral", partner: partner(t) });

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
  h.getPartnerByReferralCode.mockResolvedValue(null);
  h.isSelfReferral.mockResolvedValue(false);
  h.checkCoupon.mockImplementation(async (c: { discount_value: number }) => ({
    valid: true,
    coupon: c,
    discount_amount: 20,
  }));
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});
afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/results/hold — a typed partner code", () => {
  it("discount on: fixes the commission and takes the pool the partner leaves off", async () => {
    const full = await fullPrice();
    typedPartner(terms({ pool: 50, choice: 30, customerDiscount: true }));
    const row = await hold({ code: "abcd2345" });
    expect(row).toMatchObject({
      partner_id: "partner-1",
      attribution_source: "typed",
      partner_commission: 30,
      coupon_id: null,
      coupon_code: "ABCD2345",
      coupon_terms: { discount_type: "fixed_amount", discount_value: 20, max_discount: null },
    });
    expect(row.authorized_amount).toBe(full - 20);
    expect(h.createHoldCheckout.mock.calls.at(-1)![0].amount).toBe(full - 20);
  });

  it("discount off: commission fixed, no coupon fields, full price", async () => {
    const full = await fullPrice();
    typedPartner(terms({ pool: 50, choice: 30, customerDiscount: false }));
    const row = await hold({ code: "ABCD2345" });
    expect(row).toMatchObject({
      partner_id: "partner-1",
      attribution_source: "typed",
      partner_commission: 30,
      coupon_id: null,
      coupon_code: null,
      coupon_terms: null,
    });
    expect(row.authorized_amount).toBe(full);
  });

  it("partner takes the whole pool (no pick), discount on: nothing left, no coupon fields, commission 50", async () => {
    const full = await fullPrice();
    typedPartner(terms({ pool: 50, choice: null, customerDiscount: true }));
    const row = await hold({ code: "ABCD2345" });
    expect(row).toMatchObject({
      partner_id: "partner-1",
      partner_commission: 50,
      coupon_id: null,
      coupon_code: null,
      coupon_terms: null,
    });
    expect(row.authorized_amount).toBe(full);
  });

  it("partner takes nothing (pick 0), discount on: the whole pool comes off", async () => {
    const full = await fullPrice();
    typedPartner(terms({ pool: 50, choice: 0, customerDiscount: true }));
    const row = await hold({ code: "ABCD2345" });
    expect(row).toMatchObject({
      partner_commission: 0,
      coupon_code: "ABCD2345",
      coupon_terms: { discount_type: "fixed_amount", discount_value: 50, max_discount: null },
    });
    expect(row.authorized_amount).toBe(full - 50);
  });

  it("pool lowered below the pick: commission is the pool, nothing comes off", async () => {
    const full = await fullPrice();
    typedPartner(terms({ pool: 25, choice: 30, customerDiscount: true }));
    const row = await hold({ code: "ABCD2345" });
    expect(row).toMatchObject({ partner_commission: 25, coupon_id: null, coupon_code: null, coupon_terms: null });
    expect(row.authorized_amount).toBe(full);
  });

  it("a basic pillow: no discount, whatever the partner's terms", async () => {
    const full = await fullPrice({ suggestedTier: "basic" });
    typedPartner(terms({ pool: 50, choice: 30, customerDiscount: true }));
    const row = await hold({ code: "ABCD2345", suggestedTier: "basic" });
    expect(row).toMatchObject({ coupon_id: null, coupon_code: null, coupon_terms: null });
    expect(row.authorized_amount).toBe(full);
  });

  it("the commission and discount are the ones in effect the day the customer pays (Singapore day)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const t = terms({ pool: 50, choice: 30, nextChoice: 20, nextChoiceFrom: "2026-10-31", customerDiscount: true });

    vi.setSystemTime(new Date("2026-10-30T15:30:00Z"));
    typedPartner(t);
    expect(await hold({ code: "ABCD2345" })).toMatchObject({
      partner_commission: 30,
      coupon_terms: { discount_type: "fixed_amount", discount_value: 20, max_discount: null },
    });

    vi.setSystemTime(new Date("2026-10-30T16:30:00Z"));
    typedPartner(t);
    expect(await hold({ code: "ABCD2345" })).toMatchObject({
      partner_commission: 20,
      coupon_terms: { discount_type: "fixed_amount", discount_value: 30, max_discount: null },
    });
  });

  it("the partner's own build: no attribution, no commission, no discount", async () => {
    const full = await fullPrice();
    typedPartner(terms({ pool: 50, choice: 30, customerDiscount: true }));
    h.isSelfReferral.mockResolvedValue(true);
    const row = await hold({ code: "ABCD2345" });
    expect(row).toMatchObject({ partner_id: null, partner_commission: null, coupon_id: null, coupon_code: null, coupon_terms: null });
    expect(row.authorized_amount).toBe(full);
  });
});

describe("POST /api/results/hold — a discount code, and no partner", () => {
  it("a typed discount code applies as before, with no partner commission", async () => {
    const full = await fullPrice();
    h.resolveCheckoutCode.mockResolvedValue({ kind: "coupon", coupon: coupon() });
    const row = await hold({ code: "SAVE10" });
    expect(row).toMatchObject({
      coupon_id: "coupon-10",
      coupon_code: "SAVE10",
      coupon_terms: { discount_type: "percentage", discount_value: 10, max_discount: null },
      partner_id: null,
      partner_commission: null,
    });
    expect(row.authorized_amount).toBe(full - 20);
  });

  it("no partner discount stacks on a typed discount code, even with a partner attributed another way", async () => {
    const full = await fullPrice();
    h.getPartnerByReferralCode.mockImplementation(async (code: string) =>
      code.trim().toUpperCase() === "ABCD2345" ? partner(terms({ pool: 50, choice: 30, customerDiscount: true })) : null,
    );
    h.resolveCheckoutCode.mockResolvedValue({ kind: "coupon", coupon: coupon() });
    const row = await hold({ code: "SAVE10", partnerAssistCode: "ABCD2345" });
    expect(row).toMatchObject({
      partner_id: "partner-1",
      partner_commission: 30,
      coupon_id: "coupon-10",
      coupon_code: "SAVE10",
      coupon_terms: { discount_type: "percentage", discount_value: 10, max_discount: null },
    });
    expect(row.authorized_amount).toBe(full - 20);
  });

  it("no code and no partner: partner_commission is null", async () => {
    const row = await hold();
    expect(row).toMatchObject({ partner_id: null, partner_commission: null, coupon_id: null, coupon_code: null, coupon_terms: null });
  });

  it("an unrecognised code: partner_commission is null, full price", async () => {
    const full = await fullPrice();
    h.resolveCheckoutCode.mockResolvedValue({ kind: "unknown" });
    const row = await hold({ code: "NOPE" });
    expect(row).toMatchObject({ partner_id: null, partner_commission: null, coupon_id: null });
    expect(row.authorized_amount).toBe(full);
  });
});
