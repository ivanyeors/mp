import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * A Staff order's Checkout (ADR 0048). It settles through the shop branch like
 * any Order carrying `order_id`; the one difference is that a session lapsing
 * unpaid does not cancel the Order, because its Payment link opens another.
 */

const ORDER = "0e0e0e0e-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  rpc: [] as string[],
  timeline: vi.fn(),
  deduct: vi.fn(),
  emails: vi.fn(),
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
vi.mock("@/lib/ecommerce/money-ledger", () => ({ recordLedgerEntry: vi.fn(), rollupOrderMoney: vi.fn() }));
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
