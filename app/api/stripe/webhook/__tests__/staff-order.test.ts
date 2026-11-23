import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const ORDER = "0e0e0e0e-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  rpc: [] as string[],
  timeline: vi.fn(),
  deduct: vi.fn(),
  emails: vi.fn(),
  ledger: vi.fn(),
  rollup: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => h.event } }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => ({
      ...fakeSupabaseAdmin(h.db),
      async rpc(fn: string) {
        h.rpc.push(fn);
        return { data: false, error: null };
      },
    }),
  };
});
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: h.deduct }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/ecommerce/money-ledger", () => ({ recordLedgerEntry: h.ledger, rollupOrderMoney: h.rollup }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: h.emails, sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));
vi.mock("@/lib/shipping/schedule-labels", () => ({ scheduleAutoLabel: vi.fn(), scheduleLabelCancel: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

function deliver(type: string, session: Record<string, unknown>) {
  h.event = {
    id: `evt_${type}`,
    type,
    data: { object: { id: "cs_staff", metadata: { order_id: ORDER, purpose: "staff_order" }, ...session } },
  };
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

const order = () => h.db.orders.find((o) => o.id === ORDER)!;

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  vi.clearAllMocks();
  h.ledger.mockResolvedValue({ recorded: true });
  h.rpc = [];
  h.db = {
    orders: [
      {
        id: ORDER,
        order_number: "MP-20261107-0042",
        email: "ada@example.com",
        customer_id: null,
        currency: "SGD",
        status: "pending",
        paid_at: null,
        stripe_session_id: "cs_staff",
        subtotal: 69,
        discount_amount: 0,
        shipping_amount: 0,
        tax_amount: 0,
        total: 69,
        coupon_id: null,
        partner_id: null,
        delivered_at: null,
        shipping_address: { collect_location: { id: "studio-1", name: "Mpillow Studio" } },
        points_spent: 0,
        order_items: [],
      },
    ],
    order_items: [],
    stripe_webhook_failures: [],
    inventory_transactions: [],
    carts: [],
  };
});

describe("Stripe webhook — a Staff order's Checkout", () => {
  it("lapsing unpaid leaves the Order pending: its Payment link is still good", async () => {
    expect((await deliver("checkout.session.expired", { status: "expired" })).status).toBe(200);
    expect(order().status).toBe("pending");
    expect(order().cancelled_at).toBeUndefined();
    expect(h.timeline).not.toHaveBeenCalled();
    expect(h.rpc).toEqual([]);
  });

  it("paid, it is confirmed, sold and receipted by the shop branch", async () => {
    const res = await deliver("checkout.session.completed", {
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_staff",
      amount_total: 6900,
      total_details: { amount_tax: 0 },
    });
    expect(res.status).toBe(200);
    expect(order()).toMatchObject({ status: "confirmed", payment_reference: "pi_staff" });
    expect(order().paid_at).toBeTruthy();
    expect(order().inventory_deducted_at).toBeTruthy();
    expect(h.deduct).toHaveBeenCalledTimes(1);
    expect(h.emails).toHaveBeenCalledTimes(1);
  });

  const paidByLink = (paymentIntent: string) =>
    deliver("checkout.session.completed", {
      status: "complete",
      payment_status: "paid",
      payment_intent: paymentIntent,
      amount_total: 6900,
      total_details: { amount_tax: 0 },
    });

  it("paid through the link after Staff marked it paid in cash: the second payment is recorded and flagged, nothing is sent twice", async () => {
    Object.assign(order(), {
      status: "confirmed",
      paid_at: "2026-11-23T04:00:00.000Z",
      payment_method: "cash",
      payment_reference: null,
      inventory_deducted_at: "2026-11-23T04:00:00.000Z",
    });
    expect((await paidByLink("pi_link")).status).toBe(200);

    expect(h.ledger).toHaveBeenCalledTimes(1);
    expect(h.ledger.mock.calls[0][2]).toMatchObject({ type: "charge", amount: 69, stripeObjectId: "pi_link" });
    expect(h.rollup).toHaveBeenCalledTimes(1);
    expect(order()).toMatchObject({ needs_attention: true, payment_method: "cash", payment_reference: null });
    expect(h.timeline.mock.calls.map((c) => c[1])).toEqual(["paid_twice"]);
    expect(h.timeline.mock.calls[0][2]).toContain("Refund one of the two payments");
    expect(h.emails).not.toHaveBeenCalled();
    expect(h.deduct).not.toHaveBeenCalled();
  });

  it("the same second payment delivered again is not flagged twice", async () => {
    Object.assign(order(), { status: "confirmed", paid_at: "2026-11-23T04:00:00.000Z", payment_reference: "pi_counter" });
    h.ledger.mockResolvedValue({ recorded: false });
    expect((await paidByLink("pi_link")).status).toBe(200);
    expect(h.timeline).not.toHaveBeenCalled();
    expect(order().needs_attention).toBeUndefined();
    expect(h.emails).not.toHaveBeenCalled();
  });

  it("the order's own payment delivered again after it was confirmed is not a second payment", async () => {
    Object.assign(order(), { status: "confirmed", paid_at: "2026-11-23T04:00:00.000Z", payment_reference: "pi_staff" });
    expect((await paidByLink("pi_staff")).status).toBe(200);
    expect(h.timeline.mock.calls.map((c) => c[1])).not.toContain("paid_twice");
    expect(order().needs_attention).toBeUndefined();
  });

  it("a shop Order's lapsed Checkout is still cancelled", async () => {
    h.event = {
      id: "evt_shop_expired",
      type: "checkout.session.expired",
      data: { object: { id: "cs_staff", status: "expired", metadata: { order_id: ORDER } } },
    };
    const res = await POST(
      new Request("https://x.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: "{}" }),
    );
    expect(res.status).toBe(200);
    expect(order().status).toBe("cancelled");
  });
});
