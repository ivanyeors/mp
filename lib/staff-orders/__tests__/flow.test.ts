import { beforeEach, describe, expect, it, vi } from "vitest";

import type { FakeDb } from "@/lib/supabase/__tests__/fake-admin";
import {
  CASE_M,
  COLLECT,
  CUSTOMER,
  EAR_PAD,
  FLAT,
  PILLOW,
  SG_ADDRESS,
  SOLD_OUT,
  STUDIO,
  seedStaffOrderDb,
  staffOrderAdmin,
} from "./harness";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as FakeDb,
  taxRule: null as null | { region: string; name: string; rate: number; mode: "exclusive" | "inclusive"; appliesToShipping: boolean },
  coupon: null as null | Row,
  checkCoupon: vi.fn(),
  sent: [] as Array<{ to: string; subject: string; text: string; html: string }>,
  sessions: new Map<string, { id: string; status: string; url: string | null }>(),
  created: [] as Row[],
  expired: [] as string[],
  coupons: [] as Row[],
  onCreate: null as null | (() => void),
}));

vi.mock("@/lib/supabase/server", async () => {
  const { staffOrderAdmin: admin } = await import("./harness");
  return { supabaseAdmin: () => admin(h.db) };
});
vi.mock("@/lib/locations", () => ({
  getLocation: async (id: string) =>
    id === "studio-1"
      ? { id, name: "Mpillow Studio", type: "own", address: "200 Middle Road #01-02", postalCode: "188980", visible: false, bookable: true }
      : id === "clinic-1"
        ? { id, name: "Partner Clinic", type: "partner", address: "1 Clinic Road", postalCode: "111111", visible: true, bookable: true }
        : null,
  getLocations: async () => [],
}));
vi.mock("@/lib/ecommerce/discounts", () => ({
  findActiveCoupon: async (code: string) => (h.coupon && code.toUpperCase() === h.coupon.code ? h.coupon : null),
  checkCoupon: h.checkCoupon,
}));
vi.mock("@/lib/ecommerce/tax", async (orig) => ({
  ...(await orig<typeof import("@/lib/ecommerce/tax")>()),
  resolveTaxRuleForRegion: async () => h.taxRule,
}));
vi.mock("@/lib/shipping/quote", () => ({ quoteShippingMethods: vi.fn(async () => ({ options: [] })) }));
vi.mock("@/lib/shipping/settings", () => ({ readShippingSettings: vi.fn() }));
vi.mock("@/lib/ecommerce/order-line-cost", () => ({
  orderLinesCosts: async (_admin: unknown, lines: Array<{ quantity: number }>) =>
    lines.map((l) => ({ unit_cost: 10, total_cost: 10 * l.quantity })),
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    checkout: {
      sessions: {
        create: async (params: Row) => {
          const id = `cs_${h.created.length + 1}`;
          h.created.push(params);
          const session = { id, status: "open", url: `https://checkout.stripe.com/c/pay/${id}` };
          h.sessions.set(id, session);
          h.onCreate?.();
          return session;
        },
        retrieve: async (id: string) => h.sessions.get(id) ?? { id, status: "expired", url: null },
        expire: async (id: string) => {
          h.expired.push(id);
          const s = h.sessions.get(id);
          if (s) s.status = "expired";
          return s;
        },
      },
    },
    coupons: {
      create: async (params: Row) => {
        const coupon = { id: `co_${h.coupons.length + 1}`, ...params };
        h.coupons.push(coupon);
        return coupon;
      },
    },
  }),
}));

const { quoteStaffOrder } = await import("@/lib/staff-orders/quote");
const { createStaffOrder } = await import("@/lib/staff-orders/create");
const { sendPaymentRequest } = await import("@/lib/staff-orders/send");
const { openStaffOrderCheckout } = await import("@/lib/staff-orders/checkout");
const { expireStaffOrderLinks } = await import("@/lib/staff-orders/expire");
const { setEmailTransport } = await import("@/lib/email");

const NOW = new Date("2026-11-07T04:00:00Z");
const ORIGIN = "https://custom.mpillow.com";
const ACTOR = { userId: "user-1", email: "staff@mpillow.test" };

const admin = () => staffOrderAdmin(h.db) as never;
const studio = { kind: "studio" as const, location_id: STUDIO };
const draft = (extra: Record<string, unknown> = {}) => ({
  customer_id: CUSTOMER,
  goods: [] as Array<{ variant_id: string; quantity: number }>,
  services: [] as Array<{ key: "measurement_premium" | "measurement_basic" | "readjustment"; quantity: number }>,
  delivery: studio as Record<string, unknown>,
  ...extra,
}) as Parameters<typeof quoteStaffOrder>[1];

async function quoted(extra: Record<string, unknown>) {
  const out = await quoteStaffOrder(admin(), draft(extra));
  if (!out.ok) throw new Error(out.error);
  return out.quote;
}

async function made(extra: Record<string, unknown> = {}) {
  const quote = await quoted({ goods: [{ variant_id: EAR_PAD, quantity: 2 }], services: [{ key: "readjustment", quantity: 1 }], ...extra });
  const created = await createStaffOrder(admin(), quote, ACTOR, NOW);
  if (!created.ok) throw new Error(created.error);
  return created;
}

const order = (id: string) => h.db.orders.find((o) => o.id === id)!;
const link = (orderId: string) => h.db.order_payment_links.find((l) => l.order_id === orderId)!;

beforeEach(() => {
  h.db = seedStaffOrderDb();
  h.taxRule = null;
  h.coupon = null;
  h.checkCoupon.mockReset();
  h.sent = [];
  h.sessions.clear();
  h.created = [];
  h.expired = [];
  h.coupons = [];
  h.onCreate = null;
  setEmailTransport({
    name: "test",
    send: async (email) => {
      h.sent.push(email);
      return { id: "msg-1" };
    },
  });
});

describe("quoteStaffOrder — every amount from the database", () => {
  it("prices products at the shop's price and services at Costings, handed over at a studio", async () => {
    const q = await quoted({ goods: [{ variant_id: EAR_PAD, quantity: 2 }], services: [{ key: "readjustment", quantity: 1 }] });
    expect(q.lines.map((l) => [l.kind, l.title, l.unitPrice, l.quantity])).toEqual([
      ["goods", "Ear Comfort Pad", 39, 2],
      ["service", "Re-adjustment service", 30, 1],
    ]);
    expect(q).toMatchObject({ goodsSubtotal: 78, servicesSubtotal: 30, subtotal: 108, shippingAmount: 0, total: 108 });
    expect(q.shippingAddress).toMatchObject({
      recipient: "Ada Tan",
      line1: "200 Middle Road #01-02",
      collect_location: { id: STUDIO, name: "Mpillow Studio" },
    });
    expect(q.shippingMethodId).toBeNull();
  });

  it("sells an unlisted (draft) product, but never an archived one", async () => {
    const q = await quoted({ goods: [{ variant_id: CASE_M, quantity: 1 }] });
    expect(q.total).toBe(25.5);
    h.db.products.find((p) => p.id === "p-case")!.status = "archived";
    const out = await quoteStaffOrder(admin(), draft({ goods: [{ variant_id: CASE_M, quantity: 1 }] }));
    expect(out).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses a pillow added as a plain product: it has to come with its fillings", async () => {
    const out = await quoteStaffOrder(admin(), draft({ goods: [{ variant_id: PILLOW, quantity: 1 }] }));
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error).toMatch(/built to order/);
  });

  it("refuses more than is in stock, counting a Variant added twice once", async () => {
    const sold = await quoteStaffOrder(admin(), draft({ goods: [{ variant_id: SOLD_OUT, quantity: 1 }] }));
    expect(!sold.ok && sold.error).toBe("Travel Pouch · One size is out of stock.");
    const two = await quoteStaffOrder(
      admin(),
      draft({ goods: [{ variant_id: CASE_M, quantity: 2 }, { variant_id: CASE_M, quantity: 1 }] }),
    );
    expect(!two.ok && two.error).toBe("Only 2 of Pillow Case · Size M in stock.");
  });

  it("charges a flat method on the goods alone: a service does not reach free shipping", async () => {
    const q = await quoted({
      goods: [{ variant_id: EAR_PAD, quantity: 2 }],
      services: [{ key: "measurement_premium", quantity: 1 }],
      delivery: { kind: "ship", shipping_method_id: FLAT, address: SG_ADDRESS },
    });
    expect(q).toMatchObject({ subtotal: 118, shippingAmount: 5, total: 123, shippingMethodId: FLAT });
    expect(q.delivery).toEqual({ kind: "ship", methodId: FLAT, label: "Standard delivery" });
    expect(q.shippingAddress).not.toHaveProperty("collect_location");
  });

  it("delivers only goods, and never through a self-collect method", async () => {
    const services = await quoteStaffOrder(
      admin(),
      draft({ services: [{ key: "readjustment", quantity: 1 }], delivery: { kind: "ship", shipping_method_id: FLAT, address: SG_ADDRESS } }),
    );
    expect(!services.ok && services.error).toMatch(/done at a studio/);
    const collect = await quoteStaffOrder(
      admin(),
      draft({ goods: [{ variant_id: EAR_PAD, quantity: 1 }], delivery: { kind: "ship", shipping_method_id: COLLECT, address: SG_ADDRESS } }),
    );
    expect(!collect.ok && collect.error).toMatch(/choose a studio/);
    const clinic = await quoteStaffOrder(
      admin(),
      draft({ goods: [{ variant_id: EAR_PAD, quantity: 1 }], delivery: { kind: "studio", location_id: "clinic-1" } }),
    );
    expect(clinic.ok).toBe(false);
  });

  it("takes a discount code off the goods only, checked against this Customer's account", async () => {
    h.coupon = { id: "coupon-1", code: "TEN", discount_type: "percentage" };
    h.checkCoupon.mockImplementation(async (coupon: Row, subtotal: number) => ({
      valid: true,
      coupon,
      discount_amount: Math.round(subtotal * 10) / 100,
    }));
    const q = await quoted({
      goods: [{ variant_id: EAR_PAD, quantity: 2 }],
      services: [{ key: "readjustment", quantity: 1 }],
      code: "ten",
    });
    expect(h.checkCoupon).toHaveBeenCalledWith(
      h.coupon,
      78,
      ["p-ear"],
      ["cat-acc"],
      expect.objectContaining({ account: { customerId: CUSTOMER, email: "Ada@Example.com" } }),
    );
    expect(q).toMatchObject({ discountAmount: 7.8, discountCode: "TEN", couponId: "coupon-1", total: 100.2 });

    const servicesOnly = await quoteStaffOrder(admin(), draft({ services: [{ key: "readjustment", quantity: 1 }], code: "TEN" }));
    expect(!servicesOnly.ok && servicesOnly.error).toMatch(/products/);
    const unknown = await quoteStaffOrder(admin(), draft({ goods: [{ variant_id: EAR_PAD, quantity: 1 }], code: "NOPE" }));
    expect(unknown.ok).toBe(false);
  });

  it("adds exclusive tax on the discounted goods and services, as checkout does", async () => {
    h.taxRule = { region: "SG", name: "GST", rate: 0.09, mode: "exclusive", appliesToShipping: false };
    const q = await quoted({ goods: [{ variant_id: EAR_PAD, quantity: 1 }], services: [{ key: "readjustment", quantity: 1 }] });
    expect(q).toMatchObject({ subtotal: 69, taxAmount: 6.21, total: 75.21, taxLabel: "GST (9%)" });
  });

  it("refuses a total Stripe cannot charge", async () => {
    h.db.product_variants.find((v) => v.id === EAR_PAD)!.price = 0.3;
    const out = await quoteStaffOrder(admin(), draft({ goods: [{ variant_id: EAR_PAD, quantity: 1 }] }));
    expect(!out.ok && out.error).toMatch(/less than SGD 0.50/);
  });
});

describe("createStaffOrder — a pending Order and its link", () => {
  it("writes the quote, its lines with their costs, a 7-day link and a timeline entry; sells nothing", async () => {
    const created = await made();
    expect(created.orderNumber).toMatch(/^MP-/);
    expect(order(created.orderId)).toMatchObject({
      customer_id: CUSTOMER,
      email: "ada@example.com",
      status: "pending",
      subtotal: 108,
      total: 108,
      payment_method: "stripe",
      locale: "en-US",
    });
    expect(order(created.orderId).paid_at).toBeUndefined();
    expect(order(created.orderId).inventory_deducted_at).toBeUndefined();
    const lines = h.db.order_items.filter((i) => i.order_id === created.orderId);
    expect(lines).toEqual([
      expect.objectContaining({ kind: "goods", variant_id: EAR_PAD, unit_price: 39, total_price: 78, unit_cost: 10, total_cost: 20 }),
      expect.objectContaining({
        kind: "service",
        service_key: "readjustment",
        variant_id: null,
        sku: "SERVICE-READJUSTMENT",
        unit_price: 30,
        total_price: 30,
        unit_cost: 9,
        total_cost: 9,
      }),
    ]);
    expect(link(created.orderId)).toMatchObject({
      token: created.token,
      expires_at: "2026-11-14T04:00:00.000Z",
      created_by: "user-1",
      created_by_email: "staff@mpillow.test",
    });
    expect(h.db.order_timeline).toEqual([
      expect.objectContaining({ order_id: created.orderId, event_type: "order_created" }),
    ]);
  });
});

describe("sendPaymentRequest — the Payment request email", () => {
  it("emails the link with the order's lines and total, and renews the 7 days", async () => {
    const created = await made({ note: "Your spare pad." });
    const later = new Date("2026-11-10T04:00:00Z");
    const sent = await sendPaymentRequest(admin(), created.orderId, { origin: ORIGIN, actorEmail: ACTOR.email, now: later });
    expect(sent).toEqual({
      ok: true,
      sentTo: "ada@example.com",
      expiresAt: "2026-11-17T04:00:00.000Z",
      url: `${ORIGIN}/en-US/pay/${created.token}`,
    });
    expect(h.sent).toHaveLength(1);
    expect(h.sent[0].subject).toBe(`Your Mpillow order ${created.orderNumber} is ready to pay`);
    expect(h.sent[0].text).toContain(`${ORIGIN}/en-US/pay/${created.token}`);
    expect(h.sent[0].text).toContain("Hi Ada,");
    expect(h.sent[0].text).toContain("Collect from Mpillow Studio:");
    expect(h.sent[0].text).toContain("Your spare pad.");
    expect(h.sent[0].html).toContain(`href="${ORIGIN}/en-US/pay/${created.token}"`);
    expect(link(created.orderId)).toMatchObject({ last_sent_to: "ada@example.com", send_count: 1 });
  });

  it("refuses once the order is paid or closed", async () => {
    const created = await made();
    order(created.orderId).status = "cancelled";
    expect(await sendPaymentRequest(admin(), created.orderId, { origin: ORIGIN, actorEmail: ACTOR.email })).toMatchObject({
      ok: false,
      status: 409,
    });
    order(created.orderId).paid_at = NOW.toISOString();
    expect(await sendPaymentRequest(admin(), created.orderId, { origin: ORIGIN, actorEmail: ACTOR.email })).toMatchObject({
      ok: false,
      error: "This order is already paid.",
    });
    expect(h.sent).toEqual([]);
  });
});

describe("openStaffOrderCheckout — Pay on the link", () => {
  const cents = (params: Row) => {
    const items = params.line_items as Array<{ quantity: number; price_data: { unit_amount: number } }>;
    const lines = items.reduce((s, i) => s + i.quantity * i.price_data.unit_amount, 0);
    const shipping =
      ((params.shipping_options as Array<{ shipping_rate_data: { fixed_amount: { amount: number } } }> | undefined)?.[0]
        ?.shipping_rate_data.fixed_amount.amount ?? 0);
    const discount = h.coupons.reduce((s, c) => s + Number(c.amount_off ?? 0), 0);
    return lines + shipping - discount;
  };

  it("opens a Checkout for exactly the Order's total, settled by the shop branch", async () => {
    h.coupon = { id: "coupon-1", code: "TEN" };
    h.checkCoupon.mockImplementation(async (coupon: Row, subtotal: number) => ({
      valid: true,
      coupon,
      discount_amount: Math.round(subtotal * 10) / 100,
    }));
    h.taxRule = { region: "SG", name: "GST", rate: 0.09, mode: "exclusive", appliesToShipping: false };
    const created = await made({ code: "TEN", delivery: { kind: "ship", shipping_method_id: FLAT, address: SG_ADDRESS } });
    const total = Number(order(created.orderId).total);

    const out = await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    expect(out).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    const params = h.created[0];
    expect(params.metadata).toEqual({ order_id: created.orderId, order_number: created.orderNumber, purpose: "staff_order" });
    expect(params.customer_email).toBe("ada@example.com");
    expect(params.success_url).toBe(`${ORIGIN}/en-US/pay/${created.token}?paid=1`);
    expect(params).not.toHaveProperty("payment_method_types");
    expect(cents(params)).toBe(Math.round(total * 100));
    expect(order(created.orderId).stripe_session_id).toBe("cs_1");
  });

  it("reuses the open Checkout instead of opening a second", async () => {
    const created = await made();
    await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    const again = await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    expect(again).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_1" });
    expect(h.created).toHaveLength(1);
  });

  it("opens a new one after the last lapsed, and the link keeps working", async () => {
    const created = await made();
    await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    h.sessions.get("cs_1")!.status = "expired";
    const again = await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    expect(again).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_2" });
    expect(order(created.orderId).stripe_session_id).toBe("cs_2");
  });

  it("loses a race gracefully: its own session is closed and the winner's is used", async () => {
    const created = await made();
    h.sessions.set("cs_9", { id: "cs_9", status: "open", url: "https://checkout.stripe.com/c/pay/cs_9" });
    h.onCreate = () => {
      order(created.orderId).stripe_session_id = "cs_9";
    };
    const out = await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    expect(out).toEqual({ ok: true, url: "https://checkout.stripe.com/c/pay/cs_9" });
    expect(h.expired).toEqual(["cs_1"]);
    expect(order(created.orderId).stripe_session_id).toBe("cs_9");
  });

  it("says why it cannot be paid: unknown, expired, paid, just paid, sold out", async () => {
    expect(await openStaffOrderCheckout(admin(), crypto.randomUUID(), { origin: ORIGIN, now: NOW })).toMatchObject({ status: 404 });

    const created = await made();
    const late = new Date("2026-11-15T00:00:00Z");
    expect(await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: late })).toMatchObject({
      ok: false,
      state: "expired",
    });

    h.db.variant_stock.find((s) => s.variant_id === EAR_PAD)!.stock_available = 1;
    const short = await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    expect(!short.ok && short.error).toMatch(/^Only 1 of Ear Comfort Pad · One size in stock\. Please contact us/);
    expect(h.created).toEqual([]);

    h.db.variant_stock.find((s) => s.variant_id === EAR_PAD)!.stock_available = 5;
    await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW });
    h.sessions.get("cs_1")!.status = "complete";
    expect(await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW })).toMatchObject({
      state: "confirming",
    });

    order(created.orderId).paid_at = NOW.toISOString();
    expect(await openStaffOrderCheckout(admin(), created.token, { origin: ORIGIN, now: NOW })).toMatchObject({ state: "paid" });
  });
});

describe("expireStaffOrderLinks — the daily sweep", () => {
  it("cancels an unpaid order whose link expired, closing its open Checkout; leaves the rest", async () => {
    const stale = await made();
    const paying = await made();
    const fresh = await made();
    await openStaffOrderCheckout(admin(), stale.token, { origin: ORIGIN, now: NOW });
    await openStaffOrderCheckout(admin(), paying.token, { origin: ORIGIN, now: NOW });
    h.sessions.get("cs_2")!.status = "complete";
    link(fresh.orderId).expires_at = "2026-11-30T00:00:00.000Z";

    const summary = await expireStaffOrderLinks(admin(), new Date("2026-11-15T00:00:00Z"));
    expect(summary).toEqual({ ok: true, cancelled: 1, skipped: 1 });
    expect(order(stale.orderId)).toMatchObject({ status: "cancelled" });
    expect(h.expired).toEqual(["cs_1"]);
    expect(order(paying.orderId).status).toBe("pending");
    expect(order(fresh.orderId).status).toBe("pending");
  });
});
