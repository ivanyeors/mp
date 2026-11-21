import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";

const ORDER = "0b0b0b0b-0000-4000-8000-000000000001";

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  event: null as unknown,
  timeline: vi.fn(),
  ledger: vi.fn(),
  emails: vi.fn(),
  deduct: vi.fn(),
  autoLabel: vi.fn(),
}));

vi.mock("@/lib/stripe/client", () => ({ getStripe: () => ({ webhooks: { constructEvent: () => h.event } }) }));
vi.mock("@/lib/supabase/server", async () => {
  const { fakeSupabaseAdmin } = await import("@/lib/supabase/__tests__/fake-admin");
  return {
    supabaseAdmin: () => {
      const fake = fakeSupabaseAdmin(h.db);
      return {
        ...fake,
        from: (table: string) =>
          Object.assign(fake.from(table), {
            upsert: async (row: Record<string, unknown>) => {
              (h.db[table] ??= []).push(row);
              return { data: null, error: null };
            },
          }),
        rpc: async () => ({ data: false, error: null }),
      };
    },
  };
});
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: h.deduct }));
vi.mock("@/lib/ecommerce/mp-config-sync", () => ({ createMpConfigFromCustomization: vi.fn() }));
vi.mock("@/lib/ecommerce/customers", () => ({ updateCustomerStats: vi.fn() }));
vi.mock("@/lib/ecommerce/money-ledger", () => ({ recordLedgerEntry: h.ledger, rollupOrderMoney: vi.fn() }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: vi.fn() }));
vi.mock("@/lib/commissions/ledger", () => ({
  createHeldCommissionsForOrder: vi.fn(),
  voidCommissionsForOrder: vi.fn(),
}));
vi.mock("@/lib/milestones/ledger", () => ({ applyMilestoneProgress: vi.fn() }));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: h.emails, sendRefundEmail: vi.fn() }));
vi.mock("@/lib/email/partner", () => ({ sendReferralEarnedEmail: vi.fn() }));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: vi.fn().mockResolvedValue("sent") }));
vi.mock("@/lib/shipping/schedule-labels", () => ({ scheduleAutoLabel: h.autoLabel, scheduleLabelCancel: vi.fn() }));

const { POST } = await import("@/app/api/stripe/webhook/route");

function deliver(type: string, object: Record<string, unknown>) {
  h.event = { id: `evt_${type}`, type, data: { object } };
  return POST(
    new Request("https://x.test/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": "sig" }, body: "{}" }),
  );
}

const paidSession = {
  id: "cs_once",
  status: "complete",
  payment_status: "paid",
  payment_intent: "pi_once",
  amount_total: 8000,
  amount_subtotal: 8000,
  total_details: { amount_tax: 0, amount_discount: 0, amount_shipping: 0 },
  metadata: { order_id: ORDER },
};

const order = () => h.db.orders.find((o) => o.id === ORDER)!;
const timelineTypes = () => h.timeline.mock.calls.map((c) => c[1]);

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec";
  for (const fn of [h.timeline, h.ledger, h.emails, h.deduct, h.autoLabel]) fn.mockReset();
  h.ledger.mockResolvedValue({ recorded: true });
  h.db = {
    orders: [
      {
        id: ORDER,
        order_number: "MP-ONCE",
        email: "wei.ling@example.com",
        customer_id: null,
        currency: "SGD",
        status: "pending",
        paid_at: null,
        inventory_deducted_at: null,
        needs_attention: false,
        stripe_session_id: "cs_once",
        subtotal: 80,
        discount_amount: 0,
        shipping_amount: 0,
        tax_amount: 0,
        total: 80,
        coupon_id: null,
        partner_id: null,
        delivered_at: null,
        shipping_address: {},
        points_spent: 0,
      },
    ],
    points_ledger: [],
    stripe_webhook_failures: [],
    carts: [],
  };
});

describe("Stripe webhook — confirm once, honestly", () => {
  it("a declined attempt keeps the Order pending; the same Checkout then pays and confirms", async () => {
    const declined = await deliver("payment_intent.payment_failed", {
      id: "pi_once",
      metadata: { order_id: ORDER },
      last_payment_error: { message: "Your card was declined." },
    });
    expect(declined.status).toBe(200);
    expect(order().status).toBe("pending");
    expect(timelineTypes()).toContain("payment_failed");

    expect((await deliver("checkout.session.completed", paidSession)).status).toBe(200);
    expect(order().status).toBe("confirmed");
    expect(order().paid_at).toBeTruthy();
    expect(h.autoLabel).toHaveBeenCalledWith(expect.anything(), ORDER);
  });

  it("an Order paid after Staff cancelled it is recorded and flagged, never fulfilled", async () => {
    order().status = "cancelled";
    expect((await deliver("checkout.session.completed", paidSession)).status).toBe(200);
    expect(order().status).toBe("cancelled");
    expect(order().paid_at).toBeNull();
    expect(order().needs_attention).toBe(true);
    expect(h.ledger).toHaveBeenCalledWith(
      expect.anything(),
      ORDER,
      expect.objectContaining({ type: "charge", stripeObjectId: "pi_once" }),
    );
    expect(h.deduct).not.toHaveBeenCalled();
    expect(h.emails).not.toHaveBeenCalled();
    expect(h.autoLabel).not.toHaveBeenCalled();
    expect(timelineTypes()).toContain("paid_while_closed");
    expect(h.db.stripe_webhook_failures).toHaveLength(1);
  });

  it("an Order whose points came back before payment is confirmed but flagged", async () => {
    order().points_spent = 2000;
    order().discount_amount = 0;
    h.db.points_ledger.push({ id: "pl-1", order_id: ORDER, kind: "spend", points: -2000 });
    h.db.points_ledger.push({ id: "pl-2", order_id: ORDER, kind: "spend_release", points: 2000 });
    expect((await deliver("checkout.session.completed", paidSession)).status).toBe(200);
    expect(order().status).toBe("confirmed");
    expect(order().needs_attention).toBe(true);
    expect(timelineTypes()).toContain("points_returned_before_payment");
  });

  it("a replayed delivery confirms nothing twice, but still makes sure the emails went out", async () => {
    await deliver("checkout.session.completed", paidSession);
    await deliver("checkout.session.completed", paidSession);
    expect(timelineTypes().filter((t) => t === "payment_confirmed")).toHaveLength(1);
    expect(h.deduct).toHaveBeenCalledTimes(1);
    expect(h.emails).toHaveBeenCalledTimes(2);
  });

  it("an unexpected failure answers 500 and is dead-lettered, so Stripe retries", async () => {
    h.ledger.mockRejectedValueOnce(new Error("Ledger insert failed: connection reset"));
    const res = await deliver("checkout.session.completed", paidSession);
    expect(res.status).toBe(500);
    expect(h.db.stripe_webhook_failures).toHaveLength(1);

    expect((await deliver("checkout.session.completed", paidSession)).status).toBe(200);
    expect(h.deduct).toHaveBeenCalledTimes(1);
    expect(h.emails).toHaveBeenCalled();
  });
});

describe("Stripe webhook — an Authorization hold that expired", () => {
  beforeEach(() => {
    h.db.mp_config_responses = [
      { id: "r-held", status: "assigned", payment_intent_id: "pi_hold", authorized_amount: 120 },
      { id: "r-done", status: "accepted", payment_intent_id: "pi_other", authorized_amount: 90 },
    ];
  });

  it("drops the intent when Stripe cancelled it on its own, so Accept asks for the whole total", async () => {
    const res = await deliver("payment_intent.canceled", { id: "pi_hold", cancellation_reason: "automatic", metadata: {} });
    expect(res.status).toBe(200);
    expect(h.db.mp_config_responses[0].payment_intent_id).toBeNull();
    expect(h.db.mp_config_responses[0].authorized_amount).toBe(120);
  });

  it("leaves our own releases and Results past assigned alone", async () => {
    await deliver("payment_intent.canceled", { id: "pi_hold", cancellation_reason: null, metadata: {} });
    expect(h.db.mp_config_responses[0].payment_intent_id).toBe("pi_hold");
    await deliver("payment_intent.canceled", { id: "pi_other", cancellation_reason: "automatic", metadata: {} });
    expect(h.db.mp_config_responses[1].payment_intent_id).toBe("pi_other");
  });
});
