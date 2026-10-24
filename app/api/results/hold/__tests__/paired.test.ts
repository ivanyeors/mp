import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * A Paired build through POST /api/results/hold (ADR 0026): one request, two
 * Results, one Checkout. Same in-memory harness as ownership.test.ts, with every
 * quote stubbed to `h.total`, so the pillow and the bolster each quote 200.
 */

const h = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  requireAnyAdmin: vi.fn(),
  getAuthUser: vi.fn(),
  createHoldCheckout: vi.fn(),
  sendEmail: vi.fn(),
  total: 200,
  fetch: vi.fn(),
  resolveCheckoutCode: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const filters: Array<(r: Record<string, unknown>) => boolean> = [];
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
        const hit = [...h.rows.values()].filter((r) => filters.every((f) => f(r)));
        for (const r of hit) {
          if (op === "delete") h.rows.delete(r.id as string);
          if (op === "update") h.rows.set(r.id as string, { ...r, ...payload });
        }
        return hit.map((r) => ({ ...r }));
      };
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
        neq: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), b),
        is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), b),
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
          if (table === "shipping_methods") return { data: { slug: "standard" }, error: null };
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
  getAdminContext: vi.fn().mockResolvedValue(null),
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
vi.mock("@/lib/ecommerce/shipping", () => ({ calculateShippingRate: () => 0 }));
vi.mock("@/lib/ecommerce/tax", () => ({
  resolveTaxRuleForRegion: vi.fn().mockResolvedValue(null),
  computeTax: () => ({ taxAmount: 0 }),
}));
vi.mock("@/lib/result-pricing", () => ({ priceResult: () => ({ total: h.total, discount: 0 }) }));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/sla-reminders", () => ({
  SLA_SETTING_KEYS: [],
  parseSlaSettings: () => ({ authHoldEnabled: true }),
}));
vi.mock("@/lib/configurator/pre-order-persist", () => ({
  loadPreOrderTriggerAtHold: vi.fn().mockResolvedValue(null),
  preOrderFlagForResult: () => false,
}));
vi.mock("@/lib/referrals", () => ({ getPartnerByReferralCode: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/checkout-code", () => ({
  CHECKOUT_CODE_MAX_LENGTH: 64,
  CHECKOUT_CODE_RATE_LIMITED_MESSAGE: "Too many code attempts.",
  checkoutCodeRateLimited: () => false,
  resolveCheckoutCode: h.resolveCheckoutCode,
}));
vi.mock("@/lib/ecommerce/discounts", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/discounts")>()),
  checkCoupon: async (coupon: unknown) => ({ valid: true, coupon, discount_amount: 20 }),
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
const COMPANION = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const TOKEN = "11111111-1111-4111-8111-111111111111";

const heldRow = {
  id: ID,
  status: "held",
  source: "online_purchase",
  access_token: TOKEN,
  customer_id: null,
  customer_email: "owner@x.test",
  payment_intent_id: null,
  order_id: null,
  paired_build_id: null,
};

const pairedBolster = {
  responseId: COMPANION,
  suggestedLength: "medium",
  measurements: { height_cm: 170 },
  preferenceLines: [{ item_id: 2, quantity: 1, category: "case" }],
};

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
        shippingMethodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        shippingAddress: { recipient: "Ada", line1: "1 Road", city: "SG", postal_code: "123456" },
        recommendationRecord: {},
        pairedBolster,
        ...extra,
      }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.total = 200;
  h.rows.clear();
  h.rows.set(ID, { ...heldRow });
  h.getAuthUser.mockResolvedValue(null);
  h.requireAnyAdmin.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
  h.createHoldCheckout.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
  h.sendEmail.mockResolvedValue(undefined);
  h.fetch.mockResolvedValue(new Response("{}"));
  h.resolveCheckoutCode.mockResolvedValue(null);
  vi.stubGlobal("fetch", h.fetch);
  process.env.TELEGRAM_BOT_TOKEN = "bot";
});

describe("POST /api/results/hold — Paired build", () => {
  it("writes both Results and authorises their sum on one Checkout", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ authorizedAmount: 400, pairedResultId: COMPANION });

    expect(h.rows.get(ID)).toMatchObject({ paired_build_id: ID, authorized_amount: 200, product_type: "pillow" });
    expect(h.rows.get(COMPANION)).toMatchObject({
      paired_build_id: ID,
      product_type: "bolster",
      suggested_length: "medium",
      authorized_amount: 200,
      status: "held",
      access_token: TOKEN,
      payment_intent_id: null,
    });

    const checkout = h.createHoldCheckout.mock.calls[0][0];
    expect(checkout.amount).toBe(400);
    expect(checkout.lines).toEqual([
      { name: "Mpillow M premium hold", amount: 200 },
      { name: "Mbolster medium hold", amount: 200 },
    ]);
    expect(checkout.metadata).toEqual({
      result_id: ID,
      paired_result_id: COMPANION,
      paired_result_amount: "200",
    });
  });

  it("puts a discount code on the Mpillow only, never on its Mbolster (ADR 0033)", async () => {
    h.resolveCheckoutCode.mockResolvedValue({
      kind: "coupon",
      coupon: { id: "coupon-10", code: "SAVE10", discount_type: "percentage", discount_value: 10, max_discount: null },
    });
    const res = await post({ code: "SAVE10" });
    expect(res.status).toBe(200);
    expect(h.rows.get(ID)).toMatchObject({ coupon_id: "coupon-10", coupon_code: "SAVE10" });
    expect(h.rows.get(COMPANION)).toMatchObject({ coupon_id: null, coupon_code: null, coupon_terms: null });
  });

  it("refuses a companion id that is someone else's Result", async () => {
    h.rows.set(COMPANION, { id: COMPANION, status: "held", paired_build_id: null, payment_intent_id: null });
    const res = await post();
    expect(res.status).toBe(409);
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
    expect(h.rows.get(ID)).toEqual(heldRow);
  });

  it("drops the unpaid companion when a re-submit skips the Mbolster", async () => {
    await post();
    h.rows.set(ID, { ...h.rows.get(ID) });
    const res = await post({ pairedBolster: undefined });
    expect(res.status).toBe(200);
    expect(h.rows.has(COMPANION)).toBe(false);
    expect(h.rows.get(ID)?.paired_build_id).toBeNull();
    expect(h.createHoldCheckout.mock.calls[1][0].amount).toBe(200);
  });

  it("only pairs an Mpillow hold that takes payment", async () => {
    expect((await post({ productType: "bolster", suggestedLength: "short" })).status).toBe(400);
    expect((await post({ deferred: true })).status).toBe(400);
    expect((await post({ pairedBolster: { ...pairedBolster, responseId: ID } })).status).toBe(400);
    expect(h.createHoldCheckout).not.toHaveBeenCalled();
  });
});
