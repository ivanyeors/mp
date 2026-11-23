import { beforeEach, describe, expect, it, vi } from "vitest";

const RMA = "0c0c0c0c-0000-4000-8000-000000000001";
const ORDER = "0c0c0c0c-0000-4000-8000-0000000000aa";

const h = vi.hoisted(() => ({
  rma: {} as Record<string, unknown>,
  refundPayment: vi.fn(),
  timeline: vi.fn(),
  audit: vi.fn(),
  recordOutside: vi.fn(),
  alreadyRecorded: vi.fn(),
  transition: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/admin", () => ({ assertAdmin: async () => ({ userId: "staff-1", email: "staff@example.com" }) }));
vi.mock("@/lib/auth/audit", () => ({ recordAdminAction: h.audit }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: h.refundPayment }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));
vi.mock("@/lib/rma/transition", () => ({ applyRmaTransition: h.transition }));
vi.mock("@/lib/ecommerce/outside-refund", () => ({
  recordOutsideRefund: h.recordOutside,
  refundRecordedForReturn: h.alreadyRecorded,
}));
vi.mock("@/lib/site-settings", () => ({ getSiteSettings: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      let columns = "";
      const b: Record<string, unknown> = {
        select: (c: string) => ((columns = c), b),
        eq: () => b,
        maybeSingle: async () => ({ data: table === "rma_requests" ? onlySelected(h.rma, columns) : null, error: null }),
      };
      return b;
    },
  }),
}));

type Selection = Map<string, Selection | null>;

function parseSelect(text: string): Selection {
  const out: Selection = new Map();
  let depth = 0;
  let start = 0;
  const fields: string[] = [];
  for (let i = 0; i <= text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if ((ch === "," && depth === 0) || i === text.length) {
      fields.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  for (const field of fields.filter(Boolean)) {
    const open = field.indexOf("(");
    if (open === -1) out.set(field, null);
    else out.set(field.slice(0, open).split("!")[0].trim(), parseSelect(field.slice(open + 1, -1)));
  }
  return out;
}

function pick(value: unknown, selection: Selection): unknown {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map((v) => pick(v, selection));
  const row = value as Record<string, unknown>;
  const kept: Record<string, unknown> = {};
  for (const [name, nested] of selection) {
    if (!(name in row)) continue;
    kept[name] = nested ? pick(row[name], nested) : row[name];
  }
  return kept;
}

const onlySelected = (rma: Record<string, unknown>, columns: string) => pick(rma, parseSelect(columns));

const { issueRmaRefund } = await import("@/app/[lang]/settings/rma/actions");

type RefundArgs = { paymentIntentId: string; amount?: number; idempotencyKey: string };
const stripeCall = (n = 0) => h.refundPayment.mock.calls[n][0] as RefundArgs;
const order = () => h.rma.orders as Record<string, unknown>;

const goods = (id: string, price: number) => ({ id, quantity: 1, total_price: price, unit_price: price, kind: "goods", customization_snapshot: null });

function returnOn(orderPatch: Record<string, unknown>, returned: string[]) {
  return {
    id: RMA,
    status: "received",
    resolution: "refund",
    orders: {
      id: ORDER,
      payment_reference: "pi_rma",
      subtotal: 200,
      shipping_amount: 8,
      discount_amount: 40,
      points_discount: 0,
      self_purchase_units: 0,
      total: 168,
      amount_captured: 168,
      amount_refunded: 0,
      currency: "SGD",
      coupons: { applies_to: null },
      order_items: [goods("line-a", 100), goods("line-b", 100)],
      ...orderPatch,
    },
    rma_request_items: returned.map((order_item_id) => ({ order_item_id, quantity: 1, order_items: { unit_price: 100 } })),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.refundPayment.mockImplementation(async () => ({ id: "re_1" }));
});

describe("issueRmaRefund — what Stripe is asked for", () => {
  it("returning one of two S$100.00 lines on an Order-wide 20%-off coupon asks Stripe for S$80.00", async () => {
    h.rma = returnOn({}, ["line-a"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 80 });
    expect(h.refundPayment).toHaveBeenCalledTimes(1);
    expect(stripeCall()).toMatchObject({ paymentIntentId: "pi_rma", amount: 80, idempotencyKey: `rma_refund_${RMA}` });
    expect(h.timeline.mock.calls[0][3]).toMatchObject({ amount: 80 });
    expect(h.audit.mock.calls[0][0]).toMatchObject({ after: { amount: 80 } });
  });

  it("returning both lines on that Order refunds S$160.00 and keeps the S$8.00 shipping", async () => {
    h.rma = returnOn({}, ["line-a", "line-b"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 160 });
    expect(stripeCall().amount).toBe(160);
  });

  it("a coupon scoped to one product falls back to the list price: returning the other line gives back its S$100.00", async () => {
    h.rma = returnOn(
      { discount_amount: 50, total: 158, amount_captured: 158, coupons: { applies_to: { product_ids: ["prod-a"] } } },
      ["line-b"],
    );
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
    expect(stripeCall().amount).toBe(100);
  });

  it("a 20% Order-wide code then S$50 of points (paid S$110): returning one line asks Stripe for S$80.00", async () => {
    h.rma = returnOn({ shipping_amount: 0, discount_amount: 90, points_discount: 50, total: 110, amount_captured: 110 }, ["line-a"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 80 });
    expect(stripeCall().amount).toBe(80);
  });

  it("a 30% partner self-purchase with a free-shipping code refunds the case at its S$100.00 list price", async () => {
    h.rma = returnOn(
      {
        subtotal: 300,
        shipping_amount: 0,
        discount_amount: 60,
        total: 240,
        amount_captured: 240,
        self_purchase_units: 1,
        order_items: [goods("pillow", 200), goods("line-a", 100)],
      },
      ["line-a"],
    );
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
    expect(stripeCall().amount).toBe(100);
  });

  it("a partner self-purchase Order with no code refunds the list price", async () => {
    h.rma = returnOn(
      {
        subtotal: 300,
        shipping_amount: 0,
        discount_amount: 60,
        total: 240,
        amount_captured: 240,
        self_purchase_units: 1,
        coupons: null,
        order_items: [goods("pillow", 200), goods("line-a", 100)],
      },
      ["line-a"],
    );
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
  });

  it("a paired Result Order with a 10% code on the anchor refunds the bolster at its S$100.00 list price", async () => {
    const build = (product_type: string) => ({ result_id: `res-${product_type}`, product_type, build_lines: [] });
    h.rma = returnOn(
      {
        subtotal: 400,
        shipping_amount: 0,
        discount_amount: 30,
        total: 370,
        amount_captured: 370,
        order_items: [
          { ...goods("pillow", 300), customization_snapshot: build("pillow") },
          { ...goods("line-a", 100), customization_snapshot: build("bolster") },
        ],
      },
      ["line-a"],
    );
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
    expect(stripeCall().amount).toBe(100);
  });

  it("a staff Order with a service line and a code refunds the list price of the returned goods line", async () => {
    h.rma = returnOn(
      {
        subtotal: 250,
        total: 218,
        amount_captured: 218,
        order_items: [goods("line-a", 100), goods("line-b", 100), { id: "svc", quantity: 1, total_price: 50, unit_price: 50, kind: "service", customization_snapshot: null }],
      },
      ["line-a"],
    );
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
    expect(stripeCall().amount).toBe(100);
  });

  it("on an Order paid S$50 in points, two returns in turn refund S$100.00 and then the S$58.00 of cash left", async () => {
    const points = { discount_amount: 50, points_discount: 50, total: 158, amount_captured: 158, coupons: null };
    h.rma = returnOn(points, ["line-a"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 100 });
    expect(stripeCall(0).amount).toBe(100);

    h.rma = returnOn({ ...points, amount_refunded: 100 }, ["line-b"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 58 });
    expect(stripeCall(1).amount).toBeUndefined();
  });

  it("on that points Order, one return of both lines refunds all S$158.00 left, the same as the two returns in turn", async () => {
    h.rma = returnOn({ discount_amount: 50, points_discount: 50, total: 158, amount_captured: 158, coupons: null }, ["line-a", "line-b"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 158 });
    expect(stripeCall().amount).toBeUndefined();
  });

  it("is capped at what is left, and then sends no amount so Stripe refunds the rest", async () => {
    h.rma = returnOn({ amount_refunded: 100 }, ["line-a"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 68 });
    expect(stripeCall().amount).toBeUndefined();
  });

  it("refuses a figure that is not a positive amount, and never calls Stripe with it", async () => {
    h.rma = returnOn({}, ["line-a"]);
    delete order().total;
    delete order().amount_captured;
    await expect(issueRmaRefund(RMA)).rejects.toThrow("Nothing left to refund on this order.");
    expect(h.refundPayment).not.toHaveBeenCalled();
  });

  it("still refuses a return that has not been received", async () => {
    h.rma = { ...returnOn({}, ["line-a"]), status: "approved" };
    await expect(issueRmaRefund(RMA)).rejects.toThrow("Mark the return received");
    expect(h.refundPayment).not.toHaveBeenCalled();
  });
});

describe("issueRmaRefund — an order paid outside Stripe", () => {
  beforeEach(() => {
    h.recordOutside.mockResolvedValue({ ok: true, amount: 80, fullyRefunded: false });
    h.alreadyRecorded.mockResolvedValue(null);
  });

  it("records the refund by hand, asks Stripe for nothing and closes the return", async () => {
    h.rma = returnOn({ payment_reference: null, payment_method: "cash", paid_at: "2026-11-23T04:00:00Z" }, ["line-a"]);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 80 });
    expect(h.refundPayment).not.toHaveBeenCalled();
    expect(h.recordOutside).toHaveBeenCalledWith(
      expect.anything(),
      ORDER,
      expect.objectContaining({ amount: 80 }),
      { email: "staff@example.com" },
      expect.any(Date),
      RMA,
    );
    expect(h.transition).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ rmaId: RMA, to: "refunded" }));
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "rma.refund_recorded", after: expect.objectContaining({ amount: 80 }) }),
    );
  });

  it("pressed again after the return failed to close, it records nothing more and closes the return", async () => {
    h.rma = returnOn({ payment_reference: null, payment_method: "cash", paid_at: "2026-11-23T04:00:00Z" }, ["line-a"]);
    h.alreadyRecorded.mockResolvedValue(80);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 80 });
    expect(h.recordOutside).not.toHaveBeenCalled();
    expect(h.transition).toHaveBeenCalledTimes(1);
  });

  it("closes a return whose refund used up everything left on the order, when pressed again", async () => {
    h.rma = returnOn(
      { payment_reference: null, payment_method: "cash", paid_at: "2026-11-23T04:00:00Z", amount_refunded: 168 },
      ["line-a", "line-b"],
    );
    h.alreadyRecorded.mockResolvedValue(168);
    await expect(issueRmaRefund(RMA)).resolves.toEqual({ ok: true, amount: 168 });
    expect(h.recordOutside).not.toHaveBeenCalled();
    expect(h.transition).toHaveBeenCalledTimes(1);
  });

  it("with nothing left and nothing recorded for this return, it is refused", async () => {
    h.rma = returnOn(
      { payment_reference: null, payment_method: "cash", paid_at: "2026-11-23T04:00:00Z", amount_refunded: 168 },
      ["line-a"],
    );
    await expect(issueRmaRefund(RMA)).rejects.toThrow("Nothing left to refund on this order.");
    expect(h.transition).not.toHaveBeenCalled();
  });

  it("leaves the return open when the refund could not be recorded", async () => {
    h.rma = returnOn({ payment_reference: null, payment_method: "cash", paid_at: "2026-11-23T04:00:00Z" }, ["line-a"]);
    h.recordOutside.mockResolvedValue({ ok: false, status: 409, error: "Refresh the page." });
    await expect(issueRmaRefund(RMA)).rejects.toThrow("Refresh the page.");
    expect(h.transition).not.toHaveBeenCalled();
  });

  it("an unpaid order with no payment is still refused", async () => {
    h.rma = returnOn({ payment_reference: null, payment_method: "stripe", paid_at: null }, ["line-a"]);
    await expect(issueRmaRefund(RMA)).rejects.toThrow("Order has no payment to refund.");
    expect(h.recordOutside).not.toHaveBeenCalled();
  });
});
