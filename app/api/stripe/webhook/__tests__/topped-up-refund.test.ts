import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const ORDER = "0b0b0b0b-0000-4000-8000-000000000002";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  ledger: [] as Array<{ orderId: string; type: string; stripeObjectId: string }>,
}));

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => h.event } }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return { supabaseAdmin: () => fakeSupabaseAdmin(h.db) };
});
vi.mock("@/lib/ecommerce/money-ledger", () => ({
  recordLedgerEntry: vi.fn(async (_admin: unknown, orderId: string, entry: { type: string; stripeObjectId: string }) => {
    h.ledger.push({ orderId, type: entry.type, stripeObjectId: entry.stripeObjectId });
    return { recorded: true };
  }),
  rollupOrderMoney: vi.fn(async () => ({ status: "partially_refunded", amountRefunded: 50, amountCaptured: 420 })),
}));
vi.mock("@/lib/points/earn", () => ({ clawbackPointsForRefund: vi.fn(async () => ({ taken: 0 })) }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: vi.fn() }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: vi.fn() }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: vi.fn(), sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

function deliver(event: unknown) {
  h.event = event;
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

const refunded = (paymentIntent: string) => ({
  id: `evt_${paymentIntent}`,
  type: "charge.refunded",
  data: {
    object: {
      id: "ch_topup",
      payment_intent: paymentIntent,
      refunds: { data: [{ id: "re_topup", amount: 5000, currency: "sgd", status: "succeeded", metadata: {} }] },
    },
  },
});

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  h.ledger = [];
  h.db = {
    orders: [
      {
        id: ORDER,
        order_number: "MP-TOPUP",
        email: "wei.ling@example.com",
        customer_id: null,
        currency: "SGD",
        status: "delivered",
        payment_reference: "pi_hold",
        subtotal: 420,
        discount_amount: 0,
        shipping_amount: 0,
        tax_amount: 0,
        total: 420,
        coupon_id: null,
        partner_id: null,
        shipping_address: {},
        order_items: [],
      },
    ],
    order_payments: [
      { id: "op-1", order_id: ORDER, type: "charge", amount: 300, stripe_object_id: "pi_hold" },
      { id: "op-2", order_id: ORDER, type: "charge", amount: 120, stripe_object_id: "pi_topup" },
    ],
    stripe_webhook_failures: [],
  };
});

describe("Stripe webhook — a refund on a Result's Balance payment", () => {
  it("finds the Order through its charge row and ledgers the refund", async () => {
    expect((await deliver(refunded("pi_topup"))).status).toBe(200);
    expect(h.ledger).toEqual([{ orderId: ORDER, type: "refund", stripeObjectId: "re_topup" }]);
  });

  it("an intent no Order was paid on records nothing", async () => {
    expect((await deliver(refunded("pi_stranger"))).status).toBe(200);
    expect(h.ledger).toEqual([]);
  });

  it("a failed refund on it flags the Order", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await deliver({
      id: "evt_failed",
      type: "refund.failed",
      created: 1_793_000_000,
      data: { object: { id: "re_topup", amount: 5000, payment_intent: "pi_topup", failure_reason: "lost_or_stolen_card" } },
    });
    err.mockRestore();
    expect(res.status).toBe(200);
    expect(h.db.orders[0].needs_attention).toBe(true);
  });
});
