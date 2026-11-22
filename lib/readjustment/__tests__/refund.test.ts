import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  order: null as Row | null,
  moved: [] as Row[],
  refund: vi.fn(),
  telegram: vi.fn<(text: string) => Promise<string>>(async () => "sent"),
  timeline: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: h.refund }));
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: h.telegram }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));

const { cancellationRefund, refundCancelledReadjustment } = await import("@/lib/readjustment/refund");
const { markReadjustmentCancelledByEvent } = await import("@/lib/readjustment/lifecycle");

const admin = {
  from: (table: string) => {
    let op = "select";
    const b = {
      select: () => b,
      update: () => ((op = "update"), b),
      eq: () => b,
      maybeSingle: async () => ({ data: table === "orders" ? h.order : null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data: op === "update" && table === "readjustment_bookings" ? h.moved : null,
          error: null,
        }).then(resolve),
    };
    return b;
  },
} as never;

const VISIT = "2026-11-25T02:00:00.000Z";

const booking = (extra: Row = {}) => ({
  id: "bk-1",
  complimentary: false,
  fee_order_id: "ord-1",
  start_at: VISIT,
  guest_name: "Ada",
  product_label: "Basic Mpillow · Size S",
  ...extra,
});

const paidOrder = (extra: Row = {}): Row => ({
  id: "ord-1",
  order_number: "1077",
  status: "confirmed",
  payment_reference: "pi_123",
  currency: "sgd",
  total: 32.7,
  amount_captured: 32.7,
  amount_refunded: 0,
  ...extra,
});

beforeEach(() => {
  h.order = paidOrder();
  h.moved = [];
  h.refund.mockReset();
  h.refund.mockResolvedValue({ id: "re_1", amount: 3270, status: "succeeded" });
  h.telegram.mockClear();
  h.timeline.mockClear();
});

describe("cancellationRefund", () => {
  const dayBefore2359Sgt = new Date("2026-11-24T15:59:00.000Z");
  const visitDay0001Sgt = new Date("2026-11-24T16:01:00.000Z");

  it("refunds a customer who cancels on a Singapore day before the visit day", () => {
    expect(cancellationRefund(booking(), "booked", "customer", dayBefore2359Sgt)).toBe("refund");
    expect(cancellationRefund(booking(), "booked", "customer", new Date("2026-11-20T03:00:00Z"))).toBe("refund");
  });

  it("leaves a customer who cancels on the visit day (Singapore time) to Staff, even when UTC still says the day before", () => {
    expect(cancellationRefund(booking(), "booked", "customer", visitDay0001Sgt)).toBe("staff_decides");
    expect(cancellationRefund(booking(), "booked", "customer", new Date("2026-11-25T01:59:00Z"))).toBe("staff_decides");
  });

  it("refunds Staff cancels any time before the visit starts, on the day included", () => {
    expect(cancellationRefund(booking(), "booked", "staff", visitDay0001Sgt)).toBe("refund");
    expect(cancellationRefund(booking(), "booked", "staff", new Date("2026-11-25T01:59:00Z"))).toBe("refund");
  });

  it("refunds nothing once the visit has started", () => {
    const atStart = new Date(VISIT);
    expect(cancellationRefund(booking(), "booked", "staff", atStart)).toBe("nothing");
    expect(cancellationRefund(booking(), "booked", "customer", atStart)).toBe("nothing");
  });

  it("never refunds a no-show, and always refunds a paid visit that never got a time", () => {
    const later = new Date("2026-11-30T02:00:00Z");
    expect(cancellationRefund(booking(), "no_show", "staff", later)).toBe("nothing");
    expect(cancellationRefund(booking(), "needs_reschedule", "staff", later)).toBe("refund");
  });

  it("refunds nothing for a free visit or one with no fee Order", () => {
    const early = new Date("2026-11-20T03:00:00Z");
    expect(cancellationRefund(booking({ complimentary: true, fee_order_id: null }), "booked", "customer", early)).toBe(
      "nothing",
    );
    expect(cancellationRefund(booking({ fee_order_id: null }), "booked", "staff", early)).toBe("nothing");
  });
});

describe("refundCancelledReadjustment", () => {
  const early = new Date("2026-11-20T03:00:00Z");

  it("refunds the whole payment through Stripe with a key fixed to the booking", async () => {
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "customer", early);
    expect(out).toEqual({ kind: "refunded", refundId: "re_1", amount: 32.7 });
    expect(h.refund).toHaveBeenCalledTimes(1);
    const args = h.refund.mock.calls[0][0];
    expect(args.paymentIntentId).toBe("pi_123");
    expect(args.idempotencyKey).toBe("readjustment_cancel_refund_bk-1");
    expect(args.amount).toBeUndefined();
    expect(args.reason).toBe("requested_by_customer");
    expect(args.metadata.order_id).toBe("ord-1");
    expect(h.timeline).toHaveBeenCalledWith(
      "ord-1",
      "refund_initiated",
      "Refunded SGD 32.70 automatically: re-adjustment cancelled by the customer",
      expect.objectContaining({ stripe_refund_id: "re_1" }),
    );
  });

  it("does not call Stripe for an Order that is already refunded or was never paid", async () => {
    for (const status of ["refunded", "pending", "cancelled"]) {
      h.order = paidOrder({ status });
      expect(await refundCancelledReadjustment(admin, booking(), "booked", "staff", early)).toEqual({
        kind: "already_settled",
      });
    }
    h.order = paidOrder({ amount_refunded: 32.7, status: "partially_refunded" });
    expect((await refundCancelledReadjustment(admin, booking(), "booked", "staff", early)).kind).toBe("already_settled");
    expect(h.refund).not.toHaveBeenCalled();
  });

  it("alerts Staff instead of refunding a customer's same-day cancel", async () => {
    const out = await refundCancelledReadjustment(
      admin,
      booking(),
      "booked",
      "customer",
      new Date("2026-11-24T16:01:00.000Z"),
    );
    expect(out).toEqual({ kind: "staff_alerted" });
    expect(h.refund).not.toHaveBeenCalled();
    expect(h.telegram).toHaveBeenCalledTimes(1);
    expect(String(h.telegram.mock.calls[0][0])).toContain("Order #1077");
  });

  it("alerts Staff and does not throw when Stripe refuses", async () => {
    h.refund.mockRejectedValue(new Error("card network down"));
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "staff", early);
    expect(out).toEqual({ kind: "failed", error: "card network down" });
    expect(String(h.telegram.mock.calls[0][0])).toContain("card network down");
    expect(h.timeline).toHaveBeenCalledWith("ord-1", "refund_failed", expect.any(String), expect.any(Object));
  });
});

describe("markReadjustmentCancelledByEvent", () => {
  const early = new Date("2026-11-20T03:00:00Z");

  it("refunds the booking it moved to cancelled", async () => {
    h.moved = [booking()];
    await markReadjustmentCancelledByEvent("ev-1", "customer", admin, early);
    expect(h.refund).toHaveBeenCalledTimes(1);
  });

  it("refunds nothing when another cancel already moved the booking", async () => {
    h.moved = [];
    await markReadjustmentCancelledByEvent("ev-1", "customer", admin, early);
    expect(h.refund).not.toHaveBeenCalled();
  });
});
