import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

/**
 * An unpaid Checkout gives its points back (PRD-loyalty-points slice 04;
 * ADR 0030 (j)): `checkout.session.expired` and
 * `checkout.session.async_payment_failed` call release_points for the Order.
 * The paid path calls nothing: the `spend` is already the debit.
 *
 * `release_points` is faked with its SQL contract (20261021140000): one
 * release per Order, only for a reservation, never for a paid Order. The
 * contract itself is asserted against Postgres in
 * supabase/tests/loyalty-points/assert-04-spending.sql.
 */

const ORDER = "0a0a0a0a-0000-4000-8000-000000000001";
const CUSTOMER = "0a0a0a0a-1000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  ledger: [] as Array<{ kind: string; points: number; order_id: string }>,
  event: null as unknown,
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  rpcFails: false,
  timeline: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => h.event } }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => ({
      ...fakeSupabaseAdmin(h.db),
      async rpc(fn: string, args: Record<string, unknown>) {
        h.rpc.push({ fn, args });
        if (h.rpcFails) return { data: null, error: { message: "connection reset" } };
        if (fn !== "release_points") return { data: null, error: { message: `unexpected rpc ${fn}` } };
        const order = h.db.orders.find((o) => o.id === args.p_order_id);
        const spend = h.ledger.find((l) => l.order_id === args.p_order_id && l.kind === "spend");
        const unpaid = order && !order.paid_at && ["pending", "cancelled", "payment_failed"].includes(String(order.status));
        if (!unpaid || !spend || h.ledger.some((l) => l.order_id === args.p_order_id && l.kind === "spend_release")) {
          return { data: false, error: null };
        }
        h.ledger.push({ kind: "spend_release", points: -spend.points, order_id: String(args.p_order_id) });
        return { data: true, error: null };
      },
    }),
  };
});
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: vi.fn() }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/ecommerce/money-ledger", () => ({ recordLedgerEntry: vi.fn(), rollupOrderMoney: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: vi.fn(), sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

function deliver(type: string, session: Record<string, unknown>) {
  h.event = { id: `evt_${type}`, type, data: { object: { id: "cs_points", metadata: { order_id: ORDER }, ...session } } };
  return POST(
    new Request("https://x.test/api/stripe/webhook", {
      method: "POST",
      headers: { "stripe-signature": "sig" },
      body: "{}",
    }),
  );
}

const releases = () => h.ledger.filter((l) => l.kind === "spend_release");
const releaseCalls = () => h.rpc.filter((c) => c.fn === "release_points");
const order = () => h.db.orders.find((o) => o.id === ORDER)!;

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  h.timeline.mockReset();
  h.rpc = [];
  h.rpcFails = false;
  h.db = {
    orders: [
      {
        id: ORDER,
        order_number: "MP-PTS",
        email: "wei.ling@example.com",
        customer_id: CUSTOMER,
        currency: "SGD",
        status: "pending",
        paid_at: null,
        stripe_session_id: "cs_points",
        // Two S$50 items, S$20 of points: S$80 cash.
        subtotal: 100,
        discount_amount: 20,
        shipping_amount: 0,
        tax_amount: 0,
        total: 80,
        coupon_id: null,
        partner_id: null,
        delivered_at: null,
        shipping_address: {},
        points_spent: 2000,
        points_discount: 20,
      },
    ],
    stripe_webhook_failures: [],
    inventory_transactions: [],
    carts: [],
  };
  h.ledger = [{ kind: "spend", points: -2000, order_id: ORDER }];
});

describe("Stripe webhook — points reserved at checkout", () => {
  it("an expired Checkout gives them back exactly once; a replay changes nothing", async () => {
    expect((await deliver("checkout.session.expired", { status: "expired" })).status).toBe(200);
    expect(order().status).toBe("cancelled");
    expect(releases()).toEqual([{ kind: "spend_release", points: 2000, order_id: ORDER }]);
    expect(h.timeline).toHaveBeenCalledWith(ORDER, "points_released", expect.any(String), {});

    h.timeline.mockClear();
    expect((await deliver("checkout.session.expired", { status: "expired" })).status).toBe(200);
    expect(releases()).toHaveLength(1);
    expect(h.timeline).not.toHaveBeenCalled();
  });

  it("a failed delayed payment gives them back once", async () => {
    expect((await deliver("checkout.session.async_payment_failed", { status: "complete", payment_status: "unpaid" })).status).toBe(200);
    expect(order().status).toBe("payment_failed");
    expect(releases()).toHaveLength(1);
    await deliver("checkout.session.async_payment_failed", { status: "complete", payment_status: "unpaid" });
    expect(releases()).toHaveLength(1);
  });

  it("a paid Order never gives them back, and the paid path asks nothing of points", async () => {
    const paid = await deliver("checkout.session.completed", {
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_points",
      amount_total: 8000,
      total_details: { amount_tax: 0 },
    });
    expect(paid.status).toBe(200);
    expect(order()).toMatchObject({ status: "confirmed", total: 80 });
    expect(order().paid_at).toBeTruthy();
    expect(h.rpc).toEqual([]);

    // A late expiry or failure for the same session finds it paid.
    await deliver("checkout.session.expired", { status: "expired" });
    await deliver("checkout.session.async_payment_failed", { status: "complete" });
    expect(order().status).toBe("confirmed");
    expect(releaseCalls()).toHaveLength(2);
    expect(releases()).toEqual([]);
  });

  it("an Order with no points releases nothing", async () => {
    h.ledger = [];
    await deliver("checkout.session.expired", { status: "expired" });
    expect(order().status).toBe("cancelled");
    expect(releases()).toEqual([]);
    expect(h.timeline).not.toHaveBeenCalledWith(ORDER, "points_released", expect.anything(), expect.anything());
  });

  it("a failed release does not fail the webhook: the Order is cancelled, and the daily sweep releases it", async () => {
    h.rpcFails = true;
    expect((await deliver("checkout.session.expired", { status: "expired" })).status).toBe(200);
    expect(order().status).toBe("cancelled");
    expect(releases()).toEqual([]);
  });
});
