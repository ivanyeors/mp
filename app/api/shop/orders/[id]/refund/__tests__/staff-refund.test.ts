import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Staff refund from the order screen: everything left, chosen lines, or a
 * typed amount, linked to Stripe. The webhook writes the ledger; these pin what
 * the route asks Stripe for and what it records.
 *
 * The shop Order: two S$50 cushions and a S$20 case, S$24 off, S$8 shipping,
 * S$104 paid.
 */

const ORDER = "0b0b0b0b-0000-4000-8000-000000000001";
const CUSHIONS = "0b0b0b0b-0000-4000-8000-0000000000a1";
const CASE = "0b0b0b0b-0000-4000-8000-0000000000a2";
const REQUEST = "0b0b0b0b-2000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  order: {} as Record<string, unknown>,
  charges: [] as Array<{ stripe_object_id: string }>,
  balances: [] as Array<{ paymentIntentId: string; refundableCents: number }>,
  updates: [] as Array<{ table: string; patch: unknown }>,
  refundPayment: vi.fn(),
  timeline: vi.fn(),
  audit: vi.fn(),
  voidItems: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: async () => null,
  getAdminContext: async () => ({ userId: "staff-1", email: "staff@example.com" }),
}));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/stripe/refunds", () => ({
  refundPayment: h.refundPayment,
  intentRefundableBalances: async () => h.balances,
}));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/commissions/ledger", () => ({ voidCommissionsForItems: h.voidItems }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: () => b,
        update: (patch: unknown) => (h.updates.push({ table, patch }), b),
        single: async () => ({ data: table === "orders" ? h.order : null, error: null }),
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve({ data: table === "order_payments" ? h.charges : [], error: null }).then(resolve),
      };
      return b;
    },
  }),
}));

const { POST } = await import("@/app/api/shop/orders/[id]/refund/route");

function refund(body: Record<string, unknown>) {
  return POST(
    new Request(`https://x.test/api/shop/orders/${ORDER}/refund`, {
      method: "POST",
      body: JSON.stringify({ request_id: REQUEST, reason: "charged_in_error", ...body }),
    }),
    { params: Promise.resolve({ id: ORDER }) },
  );
}

type RefundArgs = { paymentIntentId: string; amount?: number; idempotencyKey: string; reason?: string; metadata: Record<string, string> };
const stripeCall = (n = 0) => h.refundPayment.mock.calls[n][0] as RefundArgs;

const resultSnapshot = {
  result_id: "res-1",
  product_type: "pillow",
  build_lines: [{ item_id: 1, quantity: 1, role: "filling" }],
};

beforeEach(() => {
  vi.clearAllMocks();
  h.updates = [];
  h.charges = [{ stripe_object_id: "pi_shop" }];
  h.balances = [];
  h.refundPayment.mockImplementation(async (opts: RefundArgs) => ({
    id: `re_${h.refundPayment.mock.calls.length}`,
    amount: Math.round((opts.amount ?? 0) * 100),
    status: "succeeded",
  }));
  h.order = {
    id: ORDER,
    order_number: "MP-1001",
    payment_reference: "pi_shop",
    currency: "SGD",
    status: "delivered",
    subtotal: 120,
    shipping_amount: 8,
    total: 104,
    amount_captured: 104,
    amount_refunded: 0,
    shipped_at: "2026-10-20T03:00:00Z",
    delivered_at: "2026-10-22T03:00:00Z",
    refund_request_status: null,
    partner_id: null,
    items: [
      { id: CUSHIONS, product_title: "Cushion", quantity: 2, kind: "goods", customization_snapshot: null },
      { id: CASE, product_title: "Pillow case", quantity: 1, kind: "goods", customization_snapshot: null },
    ],
  };
});

describe("staff refund — what Stripe is asked for", () => {
  it("a full refund sends no amount, so Stripe returns everything left", async () => {
    const res = await refund({ mode: "full" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, amount: 104, currency: "SGD" });
    expect(stripeCall().amount).toBeUndefined();
    expect(stripeCall().paymentIntentId).toBe("pi_shop");
  });

  it("chosen items refund the figure the dialog worked out, and the timeline names them", async () => {
    const res = await refund({
      mode: "items",
      amount: 48,
      items: [{ order_item_id: CUSHIONS, quantity: 1 }],
      shipping: true,
      note: "Charged twice for one cushion",
    });
    expect(res.status).toBe(200);
    expect(stripeCall().amount).toBe(48);
    expect(stripeCall().reason).toBeUndefined();
    expect(stripeCall().metadata).toMatchObject({ order_id: ORDER, refund_reason: "charged_in_error" });

    const [, type, message, meta] = h.timeline.mock.calls[0];
    expect(type).toBe("refund_initiated");
    expect(message).toBe(
      "Staff refunded 48.00 SGD — Charged in error: 1 × Cushion, shipping. Note: Charged twice for one cushion",
    );
    expect(meta).toMatchObject({
      amount: 48,
      lines: [{ order_item_id: CUSHIONS, product_title: "Cushion", quantity: 1 }],
      shipping: true,
    });
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "order.refund", entityId: ORDER }));
  });

  it("a duplicate charge tells Stripe it was a duplicate", async () => {
    await refund({ mode: "amount", amount: 20, reason: "duplicate" });
    expect(stripeCall().reason).toBe("duplicate");
  });

  it("two refunds of the same amount are two refunds at Stripe", async () => {
    await refund({ mode: "amount", amount: 10 });
    await POST(
      new Request(`https://x.test/api/shop/orders/${ORDER}/refund`, {
        method: "POST",
        body: JSON.stringify({
          request_id: "0b0b0b0b-2000-4000-8000-000000000002",
          mode: "amount",
          amount: 10,
          reason: "charged_in_error",
        }),
      }),
      { params: Promise.resolve({ id: ORDER }) },
    );
    expect(stripeCall(0).idempotencyKey).not.toBe(stripeCall(1).idempotencyKey);
  });
});

describe("staff refund — what it refuses", () => {
  it("more than is left to refund", async () => {
    h.order.amount_refunded = 100;
    const res = await refund({ mode: "amount", amount: 5 });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/4\.00 SGD/);
    expect(h.refundPayment).not.toHaveBeenCalled();
  });

  it("more units than were ordered, or a line from another order", async () => {
    expect((await refund({ mode: "items", amount: 1, items: [{ order_item_id: CASE, quantity: 2 }] })).status).toBe(400);
    expect(
      (
        await refund({
          mode: "items",
          amount: 1,
          items: [{ order_item_id: "0b0b0b0b-0000-4000-8000-0000000000ff", quantity: 1 }],
        })
      ).status,
    ).toBe(400);
    expect(h.refundPayment).not.toHaveBeenCalled();
  });

  it("an Other reason with no note, or items mode with nothing chosen", async () => {
    expect((await refund({ mode: "amount", amount: 5, reason: "other" })).status).toBe(400);
    expect((await refund({ mode: "items", amount: 5 })).status).toBe(400);
    expect(h.refundPayment).not.toHaveBeenCalled();
  });

  it("answers with Stripe's own message when Stripe says no", async () => {
    h.refundPayment.mockRejectedValueOnce(new Error("Charge ch_1 has been charged back."));
    const res = await refund({ mode: "full" });
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/charged back/);
    expect(h.timeline).not.toHaveBeenCalled();
  });
});

describe("staff refund — customised (Result) orders", () => {
  beforeEach(() => {
    h.order.status = "processing";
    h.order.shipped_at = null;
    h.order.delivered_at = null;
    h.order.items = [
      { id: CUSHIONS, product_title: "Custom pillow", quantity: 1, kind: "goods", customization_snapshot: resultSnapshot },
    ];
  });

  it("a charging mistake is refunded before it ships, with nothing returned", async () => {
    const res = await refund({ mode: "amount", amount: 30 });
    expect(res.status).toBe(200);
    expect(stripeCall().amount).toBe(30);
  });

  it("a return needs it shipped and back in person", async () => {
    expect((await refund({ mode: "full", reason: "returned", in_person_return_acknowledged: true })).status).toBe(400);
    h.order.status = "delivered";
    h.order.delivered_at = "2026-10-22T03:00:00Z";
    expect((await refund({ mode: "full", reason: "returned" })).status).toBe(400);
    expect(h.refundPayment).not.toHaveBeenCalled();
  });

  it("a return answers a pending refund request and voids the partner's commission on the line", async () => {
    h.order.status = "delivered";
    h.order.delivered_at = "2026-10-22T03:00:00Z";
    h.order.refund_request_status = "requested";
    h.order.partner_id = "partner-1";
    const res = await refund({
      mode: "items",
      amount: 104,
      items: [{ order_item_id: CUSHIONS, quantity: 1 }],
      reason: "returned",
      in_person_return_acknowledged: true,
    });
    expect(res.status).toBe(200);
    expect(stripeCall().reason).toBe("requested_by_customer");
    expect(h.updates).toEqual([
      { table: "orders", patch: expect.objectContaining({ refund_request_status: "approved" }) },
    ]);
    expect(h.voidItems).toHaveBeenCalledWith(expect.anything(), [CUSHIONS]);
  });

  it("a charge correction leaves a pending request and the commission alone", async () => {
    h.order.refund_request_status = "requested";
    h.order.partner_id = "partner-1";
    await refund({ mode: "items", amount: 10, items: [{ order_item_id: CUSHIONS, quantity: 1 }] });
    expect(h.updates).toEqual([]);
    expect(h.voidItems).not.toHaveBeenCalled();
  });
});

describe("staff refund — an order paid on two intents", () => {
  // A Result held at S$300 and topped up S$120 (ADR 0016): payment_reference
  // names the hold; the ledger holds both charges.
  beforeEach(() => {
    h.order.total = 420;
    h.order.subtotal = 420;
    h.order.shipping_amount = 0;
    h.order.amount_captured = 420;
    h.order.payment_reference = "pi_hold";
    h.charges = [{ stripe_object_id: "pi_hold" }, { stripe_object_id: "pi_topup" }];
    h.balances = [
      { paymentIntentId: "pi_hold", refundableCents: 30000 },
      { paymentIntentId: "pi_topup", refundableCents: 12000 },
    ];
  });

  it("a full refund refunds both charges", async () => {
    const res = await refund({ mode: "full" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ amount: 420, stripe_refund_ids: ["re_1", "re_2"] });
    expect(h.refundPayment.mock.calls.map((c) => [c[0].paymentIntentId, c[0].amount])).toEqual([
      ["pi_hold", 300],
      ["pi_topup", 120],
    ]);
    expect(stripeCall(0).idempotencyKey).not.toBe(stripeCall(1).idempotencyKey);
  });

  it("refuses more than Stripe has left across them", async () => {
    h.balances[1].refundableCents = 0;
    const res = await refund({ mode: "amount", amount: 350 });
    expect(res.status).toBe(409);
    expect(h.refundPayment).not.toHaveBeenCalled();
  });

  it("says how much went through when the second refund fails", async () => {
    h.refundPayment
      .mockImplementationOnce(async () => ({ id: "re_hold", amount: 30000, status: "succeeded" }))
      .mockRejectedValueOnce(new Error("Your card was declined."));
    const res = await refund({ mode: "full" });
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      amount: 300,
      error: "Refunded 300.00 SGD, but the rest didn't go through Stripe: Your card was declined.",
    });
    // The part that went through is still on the timeline.
    expect(h.timeline.mock.calls[0][3]).toMatchObject({ stripe_refund_ids: ["re_hold"], amount: 300 });
  });
});
