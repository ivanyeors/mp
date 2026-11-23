import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import { CUSTOMER, EAR_PAD, STUDIO, seedStaffOrderDb, staffOrderAdmin } from "./harness";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  emails: vi.fn(),
  intents: new Map<string, Row>(),
  sessions: new Map<string, { id: string; status: string; payment_intent?: string }>(),
  expired: [] as string[],
  stripeDown: false,
  deduct: vi.fn(),
  couponCounted: true,
  ledgerFails: false,
  beforeLedger: null as null | (() => void),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { staffOrderAdmin: admin } = await import("./harness");
  return { supabaseAdmin: () => admin(h.db) };
});
vi.mock("@/lib/locations", () => ({
  getLocation: async (id: string) =>
    id === "studio-1"
      ? { id, name: "Mpillow Studio", type: "own", address: "200 Middle Road #01-02", postalCode: "188980", visible: false, bookable: true }
      : null,
  getLocations: async () => [],
}));
vi.mock("@/lib/ecommerce/discounts", () => ({
  findActiveCoupon: async () => null,
  checkCoupon: vi.fn(),
  incrementCouponUsage: async () => h.couponCounted,
}));
vi.mock("@/lib/shipping/quote", () => ({ quoteShippingMethods: vi.fn(async () => ({ options: [] })) }));
vi.mock("@/lib/shipping/settings", () => ({ readShippingSettings: vi.fn() }));
vi.mock("@/lib/shipping/schedule-labels", () => ({ scheduleAutoLabel: vi.fn(), scheduleLabelCancel: vi.fn() }));
vi.mock("@/lib/ecommerce/order-line-cost", () => ({
  orderLinesCosts: async (_admin: unknown, lines: Array<{ quantity: number }>) =>
    lines.map((l) => ({ unit_cost: 10, total_cost: 10 * l.quantity })),
}));
vi.mock("@/lib/email", () => ({ sendOrderConfirmedEmails: h.emails }));
vi.mock("@/lib/ecommerce/inventory-deduction", () => ({ deductInventoryForOrder: h.deduct }));
vi.mock("@/lib/ecommerce/money-ledger", async (orig) => {
  const real = await orig<typeof import("@/lib/ecommerce/money-ledger")>();
  return {
    ...real,
    recordLedgerEntry: async (...args: Parameters<typeof real.recordLedgerEntry>) => {
      h.beforeLedger?.();
      if (h.ledgerFails) throw new Error("ledger is down");
      return real.recordLedgerEntry(...args);
    },
  };
});
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => {
    if (h.stripeDown) throw new Error("STRIPE_SECRET_KEY is not set");
    return {
      paymentIntents: {
        retrieve: async (id: string) => {
          const intent = h.intents.get(id);
          if (!intent) throw new Error(`No such payment_intent: ${id}`);
          return intent;
        },
        list: async (params: { starting_after?: string; limit: number }) => {
          const all = [...h.intents.values()];
          const from = params.starting_after ? all.findIndex((i) => i.id === params.starting_after) + 1 : 0;
          const data = all.slice(from, from + 2);
          return { data, has_more: from + 2 < all.length };
        },
      },
      checkout: {
        sessions: {
          retrieve: async (id: string) => h.sessions.get(id) ?? { id, status: "expired" },
          expire: async (id: string) => {
            h.expired.push(id);
            const s = h.sessions.get(id);
            if (s) s.status = "expired";
            return s;
          },
        },
      },
    };
  },
}));

const { quoteStaffOrder } = await import("@/lib/staff-orders/quote");
const { createStaffOrder } = await import("@/lib/staff-orders/create");
const { markStaffOrderPaid } = await import("@/lib/staff-orders/mark-paid");
const { listMatchingStripePayments, unfitReason } = await import("@/lib/staff-orders/stripe-payments");
const { PaidHowSchema, payLinkState } = await import("@/lib/staff-orders/shared");
const { isSaleCharge, paidOutsideStripe } = await import("@/lib/ecommerce/outside-stripe");

const NOW = new Date("2026-11-23T04:00:00Z");
const PAID_ON_STRIPE = Date.parse("2026-11-23T03:31:00Z") / 1000;
const ACTOR = { userId: "user-1", email: "staff@mpillow.test" };
const CASH = { kind: "outside" as const, method: "cash" as const };
const admin = () => staffOrderAdmin(h.db) as never;

async function made() {
  const out = await quoteStaffOrder(admin(), {
    customer_id: CUSTOMER,
    goods: [{ variant_id: EAR_PAD, quantity: 2 }],
    services: [{ key: "readjustment", quantity: 1 }],
    delivery: { kind: "studio", location_id: STUDIO },
  } as Parameters<typeof quoteStaffOrder>[1]);
  if (!out.ok) throw new Error(out.error);
  const created = await createStaffOrder(admin(), out.quote, ACTOR, NOW);
  if (!created.ok) throw new Error(created.error);
  return created.orderId;
}

const order = (id: string) => h.db.orders.find((o) => o.id === id)!;
const ledger = (orderId: string) => h.db.order_payments.filter((p) => p.order_id === orderId);
const timeline = (orderId: string) => h.db.order_timeline.filter((t) => t.order_id === orderId).map((t) => t.event_type);

function intent(id: string, over: Row = {}, charge: Row = {}) {
  const made = {
    id,
    status: "succeeded",
    currency: "sgd",
    amount_received: 10800,
    created: PAID_ON_STRIPE,
    capture_method: "automatic",
    description: null,
    receipt_email: "ada@example.com",
    metadata: {},
    latest_charge: {
      id: `ch_${id}`,
      created: PAID_ON_STRIPE,
      captured: true,
      refunded: false,
      amount_refunded: 0,
      disputed: false,
      balance_transaction: null,
      payment_method_details: { type: "card_present", card_present: { brand: "visa", last4: "4242" } },
      billing_details: {},
      ...charge,
    },
    ...over,
  };
  h.intents.set(id, made);
  return made;
}

const untouched = (id: string) => {
  const { status, paid_at, payment_method, payment_reference } = order(id);
  expect([status, paid_at ?? null, payment_method, payment_reference ?? null]).toEqual(["pending", null, "stripe", null]);
  expect(ledger(id)).toEqual([]);
  expect(h.deduct).not.toHaveBeenCalled();
  expect(h.emails).not.toHaveBeenCalled();
};

beforeEach(() => {
  h.db = seedStaffOrderDb();
  h.emails.mockReset();
  h.intents.clear();
  h.sessions.clear();
  h.expired = [];
  h.stripeDown = false;
  h.deduct.mockReset();
  h.couponCounted = true;
  h.ledgerFails = false;
  h.beforeLedger = null;
});

describe("marking a Staff order paid outside Stripe", () => {
  it("confirms it, records the money, takes its stock once and tells the customer", async () => {
    const id = await made();
    const out = await markStaffOrderPaid(admin(), id, { ...CASH, note: "Receipt 0042" }, ACTOR, NOW);

    expect(out).toEqual({ ok: true, paidAt: NOW.toISOString(), method: "cash", warnings: [] });
    expect(order(id)).toMatchObject({
      status: "confirmed",
      paid_at: NOW.toISOString(),
      payment_method: "cash",
      payment_reference: null,
      amount_captured: 108,
    });
    expect(paidOutsideStripe(order(id) as never)).toBe(true);
    expect(ledger(id)).toEqual([
      expect.objectContaining({
        type: "charge",
        amount: 108,
        stripe_object_id: null,
        occurred_at: NOW.toISOString(),
        metadata: { source: "outside_stripe", method: "cash", note: "Receipt 0042", marked_by: ACTOR.email },
      }),
    ]);
    expect(ledger(id).every((row) => isSaleCharge(row as never))).toBe(true);
    expect(h.deduct).toHaveBeenCalledTimes(1);
    expect(h.deduct.mock.calls[0][0]).toBe(id);
    expect(order(id).inventory_deducted_at).toBe(NOW.toISOString());
    expect(h.emails).toHaveBeenCalledTimes(1);
    expect(h.emails.mock.calls[0].slice(0, 2)).toEqual([
      id,
      expect.objectContaining({ email: "ada@example.com", total: 108, paid_at: NOW.toISOString() }),
    ]);
    expect(timeline(id)).toContain("payment_confirmed");
    const link = h.db.order_payment_links.find((l) => l.order_id === id)!;
    expect(payLinkState(order(id) as never, link as never, NOW)).toBe("paid");
  });

  it("needs no Stripe at all when the order never opened a Checkout", async () => {
    h.stripeDown = true;
    const id = await made();
    expect(await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW)).toMatchObject({ ok: true });
  });

  it("refuses a second mark, and leaves one charge and one stock deduction", async () => {
    const id = await made();
    await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW);
    const again = await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW);
    expect(again).toEqual({ ok: false, status: 409, error: "This order is already paid." });
    expect(ledger(id)).toHaveLength(1);
    expect(h.deduct).toHaveBeenCalledTimes(1);
  });

  it("refuses an order that is cancelled, and one Staff did not make", async () => {
    const id = await made();
    order(id).status = "cancelled";
    expect(await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW)).toMatchObject({ ok: false, status: 409 });

    h.db.orders.push({ id: "shop-order", status: "pending", paid_at: null, total: 10 });
    expect(await markStaffOrderPaid(admin(), "shop-order", CASH, ACTOR, NOW)).toMatchObject({ ok: false, status: 404 });
    expect(h.db.order_payments).toEqual([]);
  });

  it("asks how, when it was paid another way", () => {
    expect(PaidHowSchema.safeParse({ kind: "outside", method: "other" }).success).toBe(false);
    expect(PaidHowSchema.safeParse({ kind: "outside", method: "other", note: "Voucher" }).success).toBe(true);
    expect(PaidHowSchema.safeParse({ kind: "outside", method: "cheque" }).success).toBe(false);
  });
});

describe("marking a Staff order paid by a Stripe payment", () => {
  it("dates the sale by Stripe's time and records the payment's id", async () => {
    const id = await made();
    intent("pi_counter");
    const out = await markStaffOrderPaid(admin(), id, { kind: "stripe", payment_intent_id: "pi_counter" }, ACTOR, NOW);

    const stripeTime = new Date(PAID_ON_STRIPE * 1000).toISOString();
    expect(out).toMatchObject({ ok: true, paidAt: stripeTime, method: "stripe" });
    expect(order(id)).toMatchObject({ status: "confirmed", paid_at: stripeTime, payment_method: "stripe", payment_reference: "pi_counter" });
    expect(paidOutsideStripe(order(id) as never)).toBe(false);
    expect(ledger(id)).toEqual([
      expect.objectContaining({ type: "charge", amount: 108, stripe_object_id: "pi_counter", occurred_at: stripeTime }),
    ]);
  });

  it.each([
    ["a different amount", { amount_received: 10700 }, {}, "That Stripe payment is for SGD 107.00, and this order is SGD 108.00."],
    ["another currency", { currency: "usd" }, {}, "That Stripe payment is in USD, and this order is in SGD."],
    ["a payment that has not gone through", { status: "requires_capture" }, {}, "That Stripe payment has not gone through."],
    ["a refunded payment", {}, { amount_refunded: 500 }, "That Stripe payment has been refunded."],
    ["a disputed payment", {}, { disputed: true }, "That Stripe payment is disputed."],
    [
      "a payment made for another order on this site",
      { metadata: { order_id: "someone-else", purpose: "staff_order" } },
      {},
      "That Stripe payment already belongs to another order or customisation on this site.",
    ],
  ])("refuses %s and changes nothing", async (_name, over, charge, error) => {
    const id = await made();
    intent("pi_wrong", over, charge);
    const out = await markStaffOrderPaid(admin(), id, { kind: "stripe", payment_intent_id: "pi_wrong" }, ACTOR, NOW);
    expect(out).toEqual({ ok: false, status: 409, error });
    untouched(id);
  });

  it("refuses a payment already recorded on another order", async () => {
    const first = await made();
    const second = await made();
    intent("pi_once");
    await markStaffOrderPaid(admin(), first, { kind: "stripe", payment_intent_id: "pi_once" }, ACTOR, NOW);
    h.deduct.mockClear();
    h.emails.mockClear();

    const out = await markStaffOrderPaid(admin(), second, { kind: "stripe", payment_intent_id: "pi_once" }, ACTOR, NOW);
    expect(out).toEqual({ ok: false, status: 409, error: "That Stripe payment is already recorded on another order." });
    untouched(second);
  });

  it("puts the order back when another order claims the payment between the check and the record", async () => {
    const first = await made();
    const second = await made();
    intent("pi_raced");
    h.beforeLedger = () => {
      h.beforeLedger = null;
      h.db.order_payments.push({ id: "raced", order_id: first, type: "charge", amount: 108, stripe_object_id: "pi_raced" });
    };
    const out = await markStaffOrderPaid(admin(), second, { kind: "stripe", payment_intent_id: "pi_raced" }, ACTOR, NOW);
    expect(out).toMatchObject({ ok: false, status: 409 });
    untouched(second);
  });

  it("accepts the order's own link payment whose webhook never arrived", async () => {
    const id = await made();
    intent("pi_own", { metadata: { order_id: id, purpose: "staff_order" } });
    order(id).stripe_session_id = "cs_own";
    h.sessions.set("cs_own", { id: "cs_own", status: "complete", payment_intent: "pi_own" });
    const out = await markStaffOrderPaid(admin(), id, { kind: "stripe", payment_intent_id: "pi_own" }, ACTOR, NOW);
    expect(out).toMatchObject({ ok: true });
    expect(ledger(id)).toHaveLength(1);
  });

  it("says so when Stripe is not connected", async () => {
    const id = await made();
    h.stripeDown = true;
    const out = await markStaffOrderPaid(admin(), id, { kind: "stripe", payment_intent_id: "pi_any" }, ACTOR, NOW);
    expect(out).toMatchObject({ ok: false, status: 503 });
    untouched(id);
  });
});

describe("the payment link while Staff mark the order paid", () => {
  it("closes an open Checkout first, so the customer cannot pay as well", async () => {
    const id = await made();
    order(id).stripe_session_id = "cs_open";
    h.sessions.set("cs_open", { id: "cs_open", status: "open" });
    expect(await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW)).toMatchObject({ ok: true });
    expect(h.expired).toEqual(["cs_open"]);
  });

  it("closes a Checkout the customer opened while it was being marked paid", async () => {
    const id = await made();
    h.beforeLedger = () => {
      h.beforeLedger = null;
      order(id).stripe_session_id = "cs_late";
      h.sessions.set("cs_late", { id: "cs_late", status: "open" });
    };
    expect(await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW)).toMatchObject({ ok: true });
    expect(h.expired).toEqual(["cs_late"]);
  });

  it("refuses when the customer has just paid through the link", async () => {
    const id = await made();
    order(id).stripe_session_id = "cs_done";
    h.sessions.set("cs_done", { id: "cs_done", status: "complete", payment_intent: "pi_link" });
    const out = await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW);
    expect(out).toEqual({ ok: false, status: 409, error: "This order was just paid through its payment link. Refresh the page." });
    untouched(id);
  });

  it("does not mark it paid when the open Checkout cannot be closed", async () => {
    const id = await made();
    order(id).stripe_session_id = "cs_open";
    h.stripeDown = true;
    expect(await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW)).toMatchObject({ ok: false, status: 502 });
    untouched(id);
  });
});

describe("when a step after the payment fails", () => {
  it("puts the order back to unpaid if the money cannot be recorded", async () => {
    const id = await made();
    h.ledgerFails = true;
    expect(await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW)).toMatchObject({ ok: false, status: 500 });
    untouched(id);
  });

  it("keeps it paid but flags it when stock cannot be taken, so it can be retried", async () => {
    const id = await made();
    h.deduct.mockRejectedValueOnce(new Error("Ear Comfort Pad: 0 left"));
    const out = await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW);
    expect(out).toMatchObject({ ok: true, warnings: [expect.stringContaining("Ear Comfort Pad: 0 left")] });
    expect(order(id)).toMatchObject({ status: "confirmed", needs_attention: true, inventory_deducted_at: null });
    expect(timeline(id)).toContain("oversold");
  });

  it("flags a coupon that had reached its limit", async () => {
    const id = await made();
    order(id).coupon_id = "coupon-1";
    h.couponCounted = false;
    const out = await markStaffOrderPaid(admin(), id, CASH, ACTOR, NOW);
    expect(out).toMatchObject({ ok: true, warnings: [expect.stringContaining("usage limit")] });
    expect(order(id).needs_attention).toBe(true);
  });
});

describe("the Stripe payments offered for an order", () => {
  it("lists only unclaimed payments of exactly the order's amount, newest first, across pages", async () => {
    intent("pi_old", {}, { created: PAID_ON_STRIPE - 3600 });
    intent("pi_other_amount", { amount_received: 3000 });
    intent("pi_new", {}, { created: PAID_ON_STRIPE });
    intent("pi_taken");
    intent("pi_ours", { metadata: { result_id: "r1" } });
    h.db.order_payments = [{ id: "p1", order_id: "o1", type: "charge", amount: 108, stripe_object_id: "pi_taken" }];

    const options = await listMatchingStripePayments(admin(), (await import("@/lib/stripe/client")).getStripe(), {
      amount: 108,
      currency: "SGD",
    }, NOW);
    expect(options.map((o) => o.id)).toEqual(["pi_new", "pi_old"]);
    expect(options[0]).toMatchObject({ amount: 108, currency: "SGD", method: "Visa •••• 4242", email: "ada@example.com" });
  });

  it("treats 108.00 and 108 as the same amount, and 107.99 as another", () => {
    const pi = intent("pi_cents") as never;
    expect(unfitReason(pi, { amount: 108, currency: "sgd" })).toBeNull();
    expect(unfitReason(pi, { amount: 107.99, currency: "SGD" })).toMatch(/107\.99/);
  });
});
