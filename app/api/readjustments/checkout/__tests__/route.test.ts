import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/rate-limit";

/**
 * POST /api/readjustments/checkout — a charged re-adjustment (ADR 0024).
 *
 * Every dollar is an Order: the route holds the slot, writes a pending Order with
 * one Service fee line, and opens Checkout for the server's amount — never one
 * from the body. A Stripe failure releases the hold and cancels the Order.
 */

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  db: {} as Record<string, Row[]>,
  customer: { id: "cust-1", email: "ada@x.test" } as null | { id: string; email: string },
  target: null as unknown,
  isSlotFree: vi.fn(),
  createSession: vi.fn(),
  recordBoxConsent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      let op = "select";
      let payload: Row = {};
      const filters: Array<(r: Row) => boolean> = [];
      const rows = () => (h.db[table] ??= []);
      const run = (): Row[] => {
        if (op === "insert") {
          const row = { id: `${table}-${rows().length + 1}`, order_number: table === "orders" ? "1077" : undefined, ...payload };
          rows().push(row);
          return [row];
        }
        const hit = rows().filter((r) => filters.every((f) => f(r)));
        if (op === "update") hit.forEach((r) => Object.assign(r, payload));
        return hit;
      };
      const b = {
        select: () => b,
        insert: (p: Row) => ((op = "insert"), (payload = p), b),
        update: (p: Row) => ((op = "update"), (payload = p), b),
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), b),
        gt: (c: string, v: unknown) => (filters.push((r) => String(r[c] ?? "") > String(v)), b),
        single: async () => ({ data: run()[0] ?? null, error: null }),
        maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: run(), error: null }).then(resolve),
      };
      return b;
    },
  }),
}));
vi.mock("@/lib/readjustment/request", async (orig) => ({
  ...(await orig<typeof import("@/lib/readjustment/request")>()),
  resolveSignedInCustomer: vi.fn(async () => h.customer),
  resolveBookingTarget: vi.fn(async () => (h.target ? { target: h.target, fee: 30 } : null)),
  checkSlotRequest: vi.fn(async () => ({
    ok: true,
    slot: {
      location: { id: "loc-1", name: "Studio", address: "1 Road" },
      phone: "+6591234567",
      startIso: "2026-11-14T06:30:00.000Z",
      endIso: "2026-11-14T07:30:00.000Z",
    },
  })),
}));
vi.mock("@/lib/appointments/book-slot", () => ({ isSlotFree: h.isSlotFree }));
vi.mock("@/lib/readjustment/checkout", async (orig) => ({
  ...(await orig<typeof import("@/lib/readjustment/checkout")>()),
  createReadjustmentCheckoutSession: h.createSession,
}));
vi.mock("@/lib/ecommerce/tax", () => ({
  resolveTaxRuleForRegion: vi.fn(async () => null),
  computeTax: () => ({ taxAmount: 0 }),
}));
vi.mock("@/lib/stripe/client", () => ({ getStripe: vi.fn() }));

vi.mock("@/lib/marketing-consent/consent", () => ({ recordBoxConsent: h.recordBoxConsent }));

const { POST } = await import("@/app/api/readjustments/checkout/route");

const ITEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const basic = {
  kind: "platform",
  purchase: {
    orderItemId: ITEM,
    orderNumber: "1001",
    label: "Basic Mpillow · Size S",
    imageUrl: null,
    paidAt: "2026-01-05T02:00:00Z",
    source: "platform",
    productType: "pillow",
    tier: "basic",
    units: 1,
  },
  quote: { complimentary: false, fee: 30, reason: "not_premium" },
};

const post = (extra: Row = {}) =>
  POST(
    new Request("https://x.test/api/readjustments/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        order_item_id: ITEM,
        location_id: "loc-1",
        start_iso: "2026-11-14T06:30:00.000Z",
        end_iso: "2026-11-14T07:30:00.000Z",
        guest_name: "Ada",
        phone: "91234567",
        locale: "en-US",
        ...extra,
      }),
    }),
  );

beforeEach(() => {
  resetRateLimits();
  vi.clearAllMocks();
  h.db = {};
  h.customer = { id: "cust-1", email: "ada@x.test" };
  h.target = basic;
  h.isSlotFree.mockResolvedValue(true);
  h.createSession.mockResolvedValue({ sessionId: "cs_1", url: "https://stripe.test/cs_1" });
});

describe("POST /api/readjustments/checkout", () => {
  it("refuses a signed-out visitor", async () => {
    h.customer = null;
    expect((await post()).status).toBe(401);
  });

  it("refuses a visit the server quotes as complimentary", async () => {
    h.target = { ...basic, quote: { complimentary: true, fee: 0, seq: 1, freeUntil: "2026-11-02" } };
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("complimentary");
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("refuses a $0 fee, which Stripe can't charge — that visit books without payment", async () => {
    h.target = { ...basic, quote: { complimentary: false, fee: 0, reason: "not_premium" } };
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("complimentary");
    expect(h.createSession).not.toHaveBeenCalled();
  });

  it("holds the slot, writes a pending Order with one Service fee line, and opens Checkout", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, url: "https://stripe.test/cs_1" });

    const [booking] = h.db.readjustment_bookings;
    expect(booking).toMatchObject({
      status: "awaiting_payment",
      complimentary: false,
      fee_amount: 30,
      order_item_id: ITEM,
      fee_order_id: "orders-1",
    });
    expect(Date.parse(booking.hold_expires_at as string)).toBeGreaterThan(Date.now() + 30 * 60 * 1000);

    const [order] = h.db.orders;
    expect(order).toMatchObject({
      status: "pending",
      customer_id: "cust-1",
      subtotal: 30,
      shipping_amount: 0,
      total: 30,
      stripe_session_id: "cs_1",
    });
    expect(h.db.order_items).toEqual([
      expect.objectContaining({
        order_id: "orders-1",
        kind: "service",
        service_key: "readjustment",
        sku: "SERVICE-READJUSTMENT",
        product_title: "Re-adjustment service",
        variant_title: "Basic Mpillow · Size S · Order #1001",
        unit_price: 30,
        variant_id: null,
      }),
    ]);

    const session = h.createSession.mock.calls[0][0];
    expect(session).toMatchObject({ amount: 30, orderId: "orders-1", bookingId: "readjustment_bookings-1" });
    // Canonical origin + locale prefix; the booking id is what the page reads back.
    expect(session.successUrl).toMatch(/\/en-US\/appointments\/confirmed\?booking=readjustment_bookings-1$/);
    expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(Date.now() + 30 * 60 * 1000);
  });

  it("carries the language preference to the webhook in the Checkout Session", async () => {
    await post({ language_preference: "english" });
    expect(h.createSession.mock.calls[0][0].languagePreference).toBe("english");
  });

  it("defaults to no language preference", async () => {
    await post();
    expect(h.createSession.mock.calls[0][0].languagePreference).toBe("none");
  });

  it("charges the server's fee, whatever the body says", async () => {
    await post({ amount: 1, fee_amount: 1, price: 1 });
    expect(h.createSession.mock.calls[0][0].amount).toBe(30);
    expect(h.db.orders[0].total).toBe(30);
  });

  it("books an unlisted pillow at the fee, recording where it came from", async () => {
    h.target = {
      kind: "unlisted",
      where: "in_store",
      reference: "R-12",
      quote: { complimentary: false, fee: 30, reason: "unlisted" },
    };
    await post({ order_item_id: undefined, unlisted: { where: "in_store", reference: "R-12" } });
    expect(h.db.readjustment_bookings[0]).toMatchObject({
      purchase_source: "unlisted",
      order_item_id: null,
      unlisted_where: "in_store",
      unlisted_reference: "R-12",
    });
  });

  it("releases the hold and cancels the Order when Stripe fails", async () => {
    h.createSession.mockRejectedValue(new Error("stripe down"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(h.db.readjustment_bookings[0]).toMatchObject({ status: "expired", hold_expires_at: null });
    expect(h.db.orders[0].status).toBe("cancelled");
  });

  it("refuses a slot that has gone, before holding anything", async () => {
    h.isSlotFree.mockResolvedValue(false);
    expect((await post()).status).toBe(409);
    expect(h.db.readjustment_bookings ?? []).toEqual([]);
  });
});

// PRD-campaign-audiences slice 02: the marketing email box, ticked by default.
describe("POST /api/readjustments/checkout — the marketing email box", () => {
  it("records it for the signed-in Customer, as appointment, with the fee's Order", async () => {
    expect((await post({ marketing_email: true })).status).toBe(200);
    expect(h.recordBoxConsent).toHaveBeenCalledTimes(1);
    expect(h.recordBoxConsent.mock.calls[0].slice(1)).toEqual(["cust-1", true, "appointment"]);
  });

  it("absent is unticked; nothing is recorded when Checkout could not open", async () => {
    expect((await post()).status).toBe(200);
    expect(h.recordBoxConsent.mock.calls[0].slice(1)).toEqual(["cust-1", false, "appointment"]);
    h.recordBoxConsent.mockClear();
    h.db = {};
    h.createSession.mockRejectedValue(new Error("stripe down"));
    expect((await post({ marketing_email: true })).status).toBe(502);
    expect(h.recordBoxConsent).not.toHaveBeenCalled();
  });
});
