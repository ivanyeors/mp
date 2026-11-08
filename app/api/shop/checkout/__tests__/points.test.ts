import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * Points at shop checkout (PRD-loyalty-points slice 04; ADR 0030 (h) to (k)).
 *
 * Real handler, real coupon validation, real pricing and real Stripe session
 * construction. Faked: the tables (fake-admin), the SQL functions (`rpc`),
 * the session, the partner context, and the Stripe client, so the assertions
 * read the exact amount_off Stripe would have been sent. Every write, call and
 * Stripe request lands in `h.log`, in order.
 */

const OWNER = "8b1c3f9e-0000-4000-8000-000000000001";
const OTHER = "8b1c3f9e-0000-4000-8000-000000000002";
const PRODUCT = "22222222-2222-4222-8222-222222222222";
const VARIANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const SHIPPING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

type Rpc = (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null };

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  session: null as string | null,
  partner: null as null | { status: string; partnerId: string | null; agreedVersion: string | null },
  balance: 500,
  log: [] as string[],
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  reserve: null as unknown as Rpc,
  release: null as unknown as Rpc,
  sessionsCreate: vi.fn(),
  couponsCreate: vi.fn(),
  getPartnerContext: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const base = fakeSupabaseAdmin(h.db);
      return {
        from(table: string) {
          const q = base.from(table) as Record<string, (...a: unknown[]) => unknown>;
          for (const op of ["insert", "delete", "update"]) {
            const orig = q[op];
            q[op] = (...a: unknown[]) => {
              h.log.push(`${op}:${table}`);
              return orig(...a);
            };
          }
          return q;
        },
        async rpc(fn: string, args: Record<string, unknown>) {
          // The shared rate limiter, not a points call.
          if (fn === "rate_limit_hit") return { data: false, error: null };
          h.log.push(`rpc:${fn}`);
          h.rpcCalls.push({ fn, args });
          if (fn === "points_balance") {
            return { data: [{ available: h.balance, pending: 0, last_purchase_at: null, expires_on: null }], error: null };
          }
          if (fn === "reserve_points") return h.reserve(args);
          if (fn === "release_points") return h.release(args);
          return { data: null, error: { message: `unexpected rpc ${fn}` } };
        },
      };
    },
  };
});
vi.mock("@/lib/shop/customer-addresses", () => ({ getCurrentCustomerId: vi.fn(async () => h.session) }));
vi.mock("@/lib/auth/partner", () => ({
  getPartnerContext: h.getPartnerContext,
  isPartnerActive: (ctx: { status?: string; partnerId?: string | null } | null) =>
    Boolean(ctx && ctx.status === "approved" && ctx.partnerId),
}));
vi.mock("@/lib/partner-self-purchase/allowance", () => ({
  loadSelfPurchaseAllowance: async () => ({ kind: null, amount: 0, unitCap: 0, usedUnits: 0 }),
}));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => null,
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({ checkout: { sessions: { create: h.sessionsCreate } }, coupons: { create: h.couponsCreate } }),
}));

const { POST: checkout } = await import("@/app/api/shop/checkout/route");
const { reconcileOrderTotal } = await import("@/lib/stripe/reconcile");
const { POINTS_ACCOUNT_ERROR, POINTS_PARTNER_ERROR, POINTS_DISABLED_ERROR } = await import("@/lib/points/spend");

beforeEach(() => {
  vi.clearAllMocks();
  h.session = null;
  h.partner = null;
  h.balance = 500;
  h.log = [];
  h.rpcCalls = [];
  h.reserve = () => ({ data: "reserved", error: null });
  h.release = () => ({ data: true, error: null });
  h.getPartnerContext.mockImplementation(async () => h.partner);
  h.sessionsCreate.mockImplementation(async () => {
    h.log.push("stripe:session");
    return { id: "cs_1", url: "https://stripe.test/cs_1" };
  });
  h.couponsCreate.mockImplementation(async (p: { amount_off: number }) => ({ id: "co_1", ...p }));
  h.db = {
    product_variants: [
      {
        id: VARIANT,
        product_id: PRODUCT,
        title: "Bamboo Pillow Case",
        sku: "CASE",
        price: 50,
        currency: "SGD",
        cost_price: null,
        is_active: true,
        stripe_price_id: "price_case",
        stripe_price_id_test: "price_case",
        products: { id: PRODUCT, slug: "case", product_type: "accessory", category_id: null, content: {} },
      },
    ],
    variant_stock: [{ variant_id: VARIANT, stock_available: 10 }],
    coupons: [
      {
        id: "coupon-save10",
        code: "SAVE10",
        discount_type: "fixed_amount",
        discount_value: 10,
        currency: "SGD",
        min_order_amount: 100,
        max_discount: null,
        usage_limit: null,
        usage_count: 0,
        per_customer_limit: null,
        starts_at: null,
        expires_at: null,
        applies_to: null,
        is_active: true,
      },
    ],
    customers: [
      { id: OWNER, email: "wei.ling@example.com" },
      { id: OTHER, email: "someone@example.com" },
    ],
    shipping_methods: [
      { id: SHIPPING, slug: "std", base_rate: 5, free_above: null, currency: "SGD", is_active: true, content: {}, countries: [] },
    ],
    site_settings: [
      { key: "points_enabled", value: "true" },
      { key: "points_min_redeem", value: "50" },
      { key: "points_max_share", value: "0.5" },
    ],
    orders: [],
    order_items: [],
  };
});

function pay(email: string, opts: { points?: unknown; coupon?: string; body?: Record<string, unknown> } = {}) {
  return checkout(
    new Request("https://x.test/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        shipping_address: {
          recipient: "Tan Wei Ling",
          line1: "18 Cross Street",
          city: "Singapore",
          postal_code: "048423",
          country: "SG",
        },
        shipping_method_id: SHIPPING,
        ...(opts.coupon ? { coupon_code: opts.coupon } : {}),
        ...(opts.points !== undefined ? { points: opts.points } : {}),
        // Two S$50 items: S$100 of products.
        items: [{ variant_id: VARIANT, quantity: 2 }],
        ...opts.body,
      }),
    }),
  ).then(async (res) => ({ status: res.status, body: (await res.json()) as { error?: unknown; ok?: boolean } }));
}

const orderInsert = () => {
  const row = h.db.orders.find((o) => String(o.id).startsWith("orders-"));
  return row as Record<string, unknown> | undefined;
};
const reserveCalls = () => h.rpcCalls.filter((c) => c.fn === "reserve_points");

/** What Stripe would charge for the session the route built: catalog lines, less amount_off, plus shipping. */
function stripeCharge() {
  const params = h.sessionsCreate.mock.calls[0][0] as {
    line_items: Array<{ price?: string; price_data?: { unit_amount: number }; quantity: number }>;
    shipping_options?: Array<{ shipping_rate_data: { fixed_amount: { amount: number } } }>;
    discounts?: Array<{ coupon: string }>;
  };
  const lines = params.line_items.reduce(
    (sum, l) => sum + l.quantity * (l.price === "price_case" ? 5000 : (l.price_data?.unit_amount ?? 0)),
    0,
  );
  const amountOff = params.discounts?.length ? (h.couponsCreate.mock.calls[0][0] as { amount_off: number }).amount_off : 0;
  const shipping = params.shipping_options?.[0]?.shipping_rate_data.fixed_amount.amount ?? 0;
  return { amountOff, total: (lines - amountOff + shipping) / 100 };
}

describe("checkout with points: the Stripe total", () => {
  it("adds the points to the coupon in one amount_off, labelled, and the paid-time reconcile passes", async () => {
    h.session = OWNER;
    const res = await pay("Wei.Ling@example.com", { coupon: "SAVE10", points: 200 });
    expect(res).toEqual({ status: 200, body: expect.objectContaining({ ok: true }) });

    // S$10 coupon + S$20 of points.
    expect(h.couponsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 3000, name: "SAVE10 + Points" }));
    const order = orderInsert()!;
    expect(order).toMatchObject({
      customer_id: OWNER,
      subtotal: 100,
      discount_amount: 30,
      points_spent: 200,
      points_discount: 20,
      coupon_code: "SAVE10",
      shipping_amount: 5,
      total: 75,
    });

    const charged = stripeCharge();
    expect(charged).toEqual({ amountOff: 3000, total: 75 });
    const recon = reconcileOrderTotal(
      {
        subtotal: Number(order.subtotal),
        discount_amount: Number(order.discount_amount),
        shipping_amount: Number(order.shipping_amount),
        tax_amount: Number(order.tax_amount),
      },
      { amountTotal: charged.total, amountTax: 0 },
    );
    expect(recon.ok).toBe(true);
  });

  it("labels points alone \"Points\"", async () => {
    h.session = OWNER;
    expect((await pay("wei.ling@example.com", { points: 50 })).status).toBe(200);
    expect(h.couponsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 500, name: "Points" }));
    expect(stripeCharge().total).toBe(100 - 5 + 5);
  });

  it("reserves after the Order and its lines exist, and before Stripe opens", async () => {
    h.session = OWNER;
    await pay("wei.ling@example.com", { coupon: "SAVE10", points: 200 });
    const at = (e: string) => h.log.indexOf(e);
    expect(at("insert:orders")).toBeGreaterThanOrEqual(0);
    expect(at("insert:orders")).toBeLessThan(at("insert:order_items"));
    expect(at("insert:order_items")).toBeLessThan(at("rpc:reserve_points"));
    expect(at("rpc:reserve_points")).toBeLessThan(at("stripe:session"));
    expect(reserveCalls()).toEqual([
      { fn: "reserve_points", args: { p_customer_id: OWNER, p_order_id: orderInsert()!.id, p_points: 200 } },
    ]);
    // The session's partner context is read once, for pricing and points both.
    expect(h.getPartnerContext).toHaveBeenCalledTimes(1);
  });

  it("leaves free shipping and a coupon's minimum on the subtotal before points", async () => {
    h.session = OWNER;
    h.db.shipping_methods[0].free_above = 100;
    // SAVE10 needs S$100 of products; S$45 of points takes the cart below that, and it still applies.
    const res = await pay("wei.ling@example.com", { coupon: "SAVE10", points: 450 });
    expect(res.status).toBe(200);
    expect(orderInsert()).toMatchObject({ shipping_amount: 0, discount_amount: 55, total: 45 });
  });

  it("changes nothing for a checkout without points", async () => {
    h.session = OWNER;
    expect((await pay("wei.ling@example.com", { coupon: "SAVE10" })).status).toBe(200);
    expect(h.rpcCalls).toEqual([]);
    expect(orderInsert()).not.toHaveProperty("points_spent");
    expect(orderInsert()).not.toHaveProperty("points_discount");
    expect(h.couponsCreate).toHaveBeenCalledWith(expect.objectContaining({ amount_off: 1000, name: "SAVE10" }));
  });
});

describe("who may spend (rule h, rule r)", () => {
  const refusedBeforeAnyWrite = () => {
    expect(h.log.filter((e) => e.startsWith("insert:"))).toEqual([]);
    expect(reserveCalls()).toEqual([]);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  };

  it("refuses a guest, even one typing the owner's email", async () => {
    expect(await pay("wei.ling@example.com", { points: 100 })).toEqual({ status: 400, body: { error: POINTS_ACCOUNT_ERROR } });
    refusedBeforeAnyWrite();
  });

  // Carried over from the retired bound coupon (slice 06): whose account it is
  // comes from the session, never from the request.
  it("ignores a Customer named in the body: a guest claiming to be the owner is refused", async () => {
    const forged = { customer_id: OWNER, customerId: OWNER, session_customer_id: OWNER };
    expect(await pay("wei.ling@example.com", { points: 1000, body: forged })).toEqual({
      status: 400,
      body: { error: POINTS_ACCOUNT_ERROR },
    });
    refusedBeforeAnyWrite();
  });

  it("refuses a different signed-in Customer, under either email", async () => {
    h.session = OTHER;
    expect(await pay("wei.ling@example.com", { points: 100 })).toEqual({ status: 400, body: { error: POINTS_ACCOUNT_ERROR } });
    refusedBeforeAnyWrite();
  });

  it("refuses the owner checking out under another email", async () => {
    h.session = OWNER;
    expect(await pay("someone@example.com", { points: 100 })).toEqual({ status: 400, body: { error: POINTS_ACCOUNT_ERROR } });
    expect(await pay("new.address@example.com", { points: 100 })).toEqual({ status: 400, body: { error: POINTS_ACCOUNT_ERROR } });
    refusedBeforeAnyWrite();
  });

  it("refuses a signed-in partner, by the context self-purchase pricing reads", async () => {
    h.session = OWNER;
    h.partner = { status: "approved", partnerId: "partner-1", agreedVersion: null };
    expect(await pay("wei.ling@example.com", { points: 100 })).toEqual({ status: 400, body: { error: POINTS_PARTNER_ERROR } });
    refusedBeforeAnyWrite();
  });

  it("refuses a partner the session missed, when reserve_points finds them (is_partner_customer)", async () => {
    h.session = OWNER;
    h.reserve = () => ({ data: "partner", error: null });
    expect(await pay("wei.ling@example.com", { points: 100 })).toEqual({ status: 409, body: { error: POINTS_PARTNER_ERROR } });
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.db.orders).toEqual([]);
  });

  it("accepts the owner using their own email, in any case", async () => {
    h.session = OWNER;
    expect((await pay("Wei.Ling@Example.com", { points: 100 })).status).toBe(200);
  });

  it("refuses while points are switched off", async () => {
    h.session = OWNER;
    h.db.site_settings[0].value = "false";
    expect(await pay("wei.ling@example.com", { points: 100 })).toEqual({ status: 400, body: { error: POINTS_DISABLED_ERROR } });
    refusedBeforeAnyWrite();
  });
});

describe("forged amounts (rule i)", () => {
  beforeEach(() => {
    h.session = OWNER;
  });

  it.each([
    ["an odd step", 55, "Points are used in steps of 10 (S$1)."],
    ["a fraction", 100.5, "Points are used in steps of 10 (S$1)."],
    ["a negative", -100, "Points are used in steps of 10 (S$1)."],
    ["below the minimum", 40, "Use at least 50 points (S$5.00)."],
    // S$100 less the S$10 coupon: half is S$45.
    ["above half the products after the coupon", 460, "This order can take at most 450 points (S$45.00)."],
  ])("refuses %s", async (_name, points, error) => {
    h.balance = 10000;
    expect(await pay("wei.ling@example.com", { coupon: "SAVE10", points })).toEqual({ status: 400, body: { error } });
    expect(h.db.orders).toEqual([]);
    expect(reserveCalls()).toEqual([]);
  });

  it("refuses more than the balance", async () => {
    h.balance = 300;
    expect(await pay("wei.ling@example.com", { coupon: "SAVE10", points: 400 })).toEqual({
      status: 400,
      body: { error: "You have 300 points (S$30.00) to use." },
    });
    expect(h.db.orders).toEqual([]);
  });

  it("refuses a schema-breaking value outright", async () => {
    expect((await pay("wei.ling@example.com", { points: "200" })).status).toBe(400);
    expect(h.db.orders).toEqual([]);
  });
});

describe("the reservation and its release (rule j)", () => {
  beforeEach(() => {
    h.session = OWNER;
  });

  it("refuses cleanly when another tab spent the balance first: no Order left, no Stripe", async () => {
    h.reserve = () => ({ data: "insufficient", error: null });
    const res = await pay("wei.ling@example.com", { points: 200 });
    expect(res.status).toBe(409);
    expect(String(res.body.error)).toMatch(/balance has changed/);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
    expect(h.db.orders).toEqual([]);
    expect(h.log).toContain("delete:order_items");
    // Nothing was reserved, so nothing is released.
    expect(h.rpcCalls.map((c) => c.fn)).not.toContain("release_points");
  });

  it("gives the points back when Stripe refuses to open the Checkout, before the Order goes", async () => {
    h.sessionsCreate.mockRejectedValueOnce(new Error("Stripe is down"));
    const res = await pay("wei.ling@example.com", { points: 200 });
    expect(res).toEqual({ status: 500, body: { error: "Stripe is down" } });
    const release = h.rpcCalls.find((c) => c.fn === "release_points");
    expect(release?.args).toEqual({ p_order_id: expect.stringMatching(/^orders-/) });
    expect(h.log.indexOf("rpc:release_points")).toBeLessThan(h.log.indexOf("delete:orders"));
    expect(h.db.orders).toEqual([]);
  });

  it("keeps the Order, cancelled, when the release cannot be confirmed, so the daily sweep finds it", async () => {
    h.sessionsCreate.mockRejectedValueOnce(new Error("Stripe is down"));
    h.release = () => ({ data: null, error: { message: "connection reset" } });
    expect((await pay("wei.ling@example.com", { points: 200 })).status).toBe(500);
    expect(h.log).not.toContain("delete:orders");
    expect(orderInsert()).toMatchObject({ status: "cancelled", points_spent: 200 });
  });

  it("does not release anything on a Stripe error when no points were used", async () => {
    h.sessionsCreate.mockRejectedValueOnce(new Error("Stripe is down"));
    expect((await pay("wei.ling@example.com")).status).toBe(500);
    expect(h.rpcCalls).toEqual([]);
    expect(h.db.orders).toEqual([]);
  });
});

describe("the one code field (ADR 0033)", () => {
  it("applies a discount code typed into it, case and spaces aside", async () => {
    const res = await pay("wei.ling@example.com", { body: { code: " save10 " } });
    expect(res.status).toBe(200);
    expect(orderInsert()).toMatchObject({ coupon_id: "coupon-save10", coupon_code: "SAVE10", discount_amount: 10 });
    expect(stripeCharge()).toEqual({ amountOff: 1000, total: 95 });
  });

  it("attributes a partner's referral code and takes nothing off", async () => {
    h.db.partners = [{ id: "partner-1", name: "Spine Clinic", type: "partner", referral_code: "ABCD2345" }];
    const res = await pay("wei.ling@example.com", { body: { code: "abcd2345" } });
    expect(res.status).toBe(200);
    expect(orderInsert()).toMatchObject({
      partner_id: "partner-1",
      ref_code: "ABCD2345",
      attribution_source: "typed",
      coupon_id: null,
      discount_amount: 0,
    });
  });

  it("never blocks on a code nobody recognises", async () => {
    const res = await pay("wei.ling@example.com", { body: { code: "NOPE123" } });
    expect(res.status).toBe(200);
    expect(orderInsert()).toMatchObject({ coupon_id: null, partner_id: null, discount_amount: 0, total: 105 });
  });

  it("refuses a discount code that cannot be used on this order, with its reason", async () => {
    // SAVE10 needs S$100 of products; one S$50 item is not enough.
    const res = await pay("wei.ling@example.com", {
      body: { code: "SAVE10", items: [{ variant_id: VARIANT, quantity: 1 }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/at least SGD 100\.00/);
    expect(h.sessionsCreate).not.toHaveBeenCalled();
  });

  describe("one code per order: a referral never rides with a discount", () => {
    beforeEach(() => {
      h.db.partners = [{ id: "partner-1", name: "Spine Clinic", type: "partner", referral_code: "ABCD2345" }];
    });

    it("a referral in the field ignores a discount sent in the old coupon_code field", async () => {
      const res = await pay("wei.ling@example.com", { coupon: "SAVE10", body: { code: "ABCD2345" } });
      expect(res.status).toBe(200);
      expect(orderInsert()).toMatchObject({ partner_id: "partner-1", coupon_id: null, discount_amount: 0 });
      expect(h.couponsCreate).not.toHaveBeenCalled();
    });

    it("a discount in the field ignores a referral sent in the old referral_code field", async () => {
      const res = await pay("wei.ling@example.com", { body: { code: "SAVE10", referral_code: "ABCD2345" } });
      expect(res.status).toBe(200);
      expect(orderInsert()).toMatchObject({ coupon_id: "coupon-save10", discount_amount: 10, partner_id: null });
    });

    it("with only the old fields, the discount applies and the referral is dropped", async () => {
      const res = await pay("wei.ling@example.com", { coupon: "SAVE10", body: { referral_code: "ABCD2345" } });
      expect(res.status).toBe(200);
      expect(orderInsert()).toMatchObject({ coupon_id: "coupon-save10", discount_amount: 10, partner_id: null });
    });

    it("a partner's own code on their own order credits nobody", async () => {
      h.partner = { status: "approved", partnerId: "partner-1", agreedVersion: null };
      const res = await pay("wei.ling@example.com", { body: { code: "ABCD2345" } });
      expect(res.status).toBe(200);
      expect(orderInsert()).toMatchObject({ partner_id: null, ref_code: null });
    });

    it("so does a partner's code under their own sign-in email, signed out", async () => {
      h.db.partner_users = [
        { id: "pu-1", partner_id: "partner-1", email: "wei.ling@example.com", backup_email: null, backup_email_verified: false },
      ];
      const res = await pay("Wei.Ling@example.com", { body: { code: "ABCD2345" } });
      expect(res.status).toBe(200);
      expect(orderInsert()).toMatchObject({ partner_id: null, ref_code: null });
    });
  });

  it("opens a Checkout that lapses within the hour, so an abandoned one hands its code back", async () => {
    const before = Math.floor(Date.now() / 1000);
    expect((await pay("wei.ling@example.com", { body: { code: "SAVE10" } })).status).toBe(200);
    const { expires_at } = h.sessionsCreate.mock.calls[0][0] as { expires_at: number };
    expect(expires_at - before).toBeGreaterThanOrEqual(3600 - 5);
    expect(expires_at - before).toBeLessThanOrEqual(3600 + 5);
  });

  it("still refuses an unknown coupon_code from a tab opened before the field changed", async () => {
    const res = await pay("wei.ling@example.com", { coupon: "NOPE123" });
    expect(res.status).toBe(400);
    expect(h.db.orders).toEqual([]);
  });
});
