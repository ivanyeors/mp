import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  order: null as Row | null,
  moved: [] as Row[],
  updateError: null as { message: string } | null,
  orderError: null as { message: string } | null,
  refund: vi.fn(),
  method: vi.fn(),
  send: vi.fn(),
  telegram: vi.fn<(text: string) => Promise<string>>(async () => "sent"),
  timeline: vi.fn(async () => {}),
}));

vi.mock("@/lib/supabase/server", () => ({ supabaseAdmin: () => ({}) }));
vi.mock("@/lib/stripe/refunds", () => ({ refundPayment: h.refund, intentPaymentMethodType: h.method }));
vi.mock("@/lib/email", () => ({ getEmailTransport: () => ({ name: "test", send: h.send }) }));
vi.mock("@/lib/email/transport", () => ({ getDefaultFromAddress: () => "Mpillow <hello@test>" }));
vi.mock("@/lib/email/copy-store", async () => {
  const { defaultEmailCopy } = await import("@/lib/email/copy");
  return { loadEmailCopy: async (spec: never) => defaultEmailCopy(spec) };
});
vi.mock("@/lib/telegram/notify", () => ({ sendTelegram: h.telegram }));
vi.mock("@/lib/ecommerce/orders", () => ({ addOrderTimelineEvent: h.timeline }));

const { cancellationRefund, refundCancelledReadjustment } = await import("@/lib/readjustment/refund");
const { markReadjustmentCancelledByEvent } = await import("@/lib/readjustment/lifecycle");

const admin = {
  from: (table: string) => {
    let op = "select";
    let columns: string[] | null = null;
    const only = (row: Row) =>
      columns ? Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]])) : row;
    const b = {
      select: (cols?: string) => ((columns = cols ? cols.split(",").map((c) => c.trim()) : null), b),
      update: () => ((op = "update"), b),
      eq: () => b,
      maybeSingle: async () =>
        table === "orders" && h.orderError
          ? { data: null, error: h.orderError }
          : { data: table === "orders" ? h.order : null, error: null },
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          op === "update" && table === "readjustment_bookings" && h.updateError
            ? { data: null, error: h.updateError }
            : { data: op === "update" && table === "readjustment_bookings" ? h.moved.map(only) : null, error: null },
        ).then(resolve),
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
  email: "ada@example.com",
  location_name: "Mpillow Studio",
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
  h.updateError = null;
  h.orderError = null;
  h.method.mockReset();
  h.method.mockResolvedValue("card");
  h.send.mockReset();
  h.send.mockResolvedValue({ id: "em_1" });
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
  const visitDay = new Date("2026-11-24T16:01:00.000Z");
  const FEE = { amount: 32.7, currency: "SGD", orderNumber: "1077" };
  const sentText = () => {
    expect(h.send).toHaveBeenCalledTimes(1);
    const mail = h.send.mock.calls[0][0] as { to: string; text: string; subject: string };
    expect(mail.to).toBe("ada@example.com");
    return mail.text;
  };

  it("refunds the whole payment through Stripe with a key fixed to the booking", async () => {
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "customer", early);
    expect(out).toEqual({ kind: "refunded", refundId: "re_1", fee: FEE });
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

  it("emails the customer the refund with the 5–10 business day range, naming the visit", async () => {
    await refundCancelledReadjustment(admin, booking(), "booked", "customer", early);
    const text = sentText();
    expect(text).toContain("Basic Mpillow · Size S");
    expect(text).toContain("Mpillow Studio");
    expect(text).toMatch(/We've refunded SGD\s32\.70/);
    expect(text).toContain("5–10 business days");
  });

  it("does not call Stripe or email for an Order that is already refunded or was never paid", async () => {
    for (const status of ["refunded", "pending", "cancelled"]) {
      h.order = paidOrder({ status });
      expect(await refundCancelledReadjustment(admin, booking(), "booked", "staff", early)).toEqual({
        kind: "already_settled",
      });
    }
    h.order = paidOrder({ amount_refunded: 32.7, status: "partially_refunded" });
    expect((await refundCancelledReadjustment(admin, booking(), "booked", "staff", early)).kind).toBe("already_settled");
    expect(h.refund).not.toHaveBeenCalled();
    expect(h.send).not.toHaveBeenCalled();
  });

  it("sends nothing for a free visit", async () => {
    const out = await refundCancelledReadjustment(admin, booking({ complimentary: true }), "booked", "customer", early);
    expect(out).toEqual({ kind: "nothing" });
    expect(h.send).not.toHaveBeenCalled();
  });

  it("does not refund a customer's visit-day cancel, tells Staff, and tells the customer it is refunded by hand only", async () => {
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "customer", visitDay);
    expect(out).toEqual({ kind: "visit_day", fee: FEE });
    expect(h.refund).not.toHaveBeenCalled();
    expect(h.telegram).toHaveBeenCalledTimes(1);
    expect(String(h.telegram.mock.calls[0][0])).toContain("Order #1077");
    expect(sentText()).toContain("subject to manual refunds only");
  });

  it("never refunds a PayNow payment through Stripe: Staff refund it from the Order or add points, and the customer is told", async () => {
    h.method.mockResolvedValue("paynow");
    for (const by of ["customer", "staff"] as const) {
      h.send.mockClear();
      h.telegram.mockClear();
      const out = await refundCancelledReadjustment(admin, booking(), "booked", by, early);
      expect(out).toEqual({ kind: "paynow", fee: FEE });
      const alert = String(h.telegram.mock.calls[0][0]);
      expect(alert).toContain("PayNow");
      expect(alert).toContain("3,270 points");
      expect(alert).toContain("Refund it from the Order");
      const text = sentText();
      expect(text).toContain("You paid by PayNow");
      expect(text).toContain("points of the same value");
    }
    expect(h.method).toHaveBeenCalledWith("pi_123");
    expect(h.refund).not.toHaveBeenCalled();
    expect(h.timeline).toHaveBeenCalledWith("ord-1", "readjustment_cancelled", expect.stringContaining("PayNow"), expect.any(Object));
  });

  it("alerts Staff, tells the customer, and does not throw when Stripe refuses", async () => {
    h.refund.mockRejectedValue(new Error("card network down"));
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "staff", early);
    expect(out).toEqual({ kind: "failed", error: "card network down", fee: FEE });
    expect(String(h.telegram.mock.calls[0][0])).toContain("card network down");
    expect(h.timeline).toHaveBeenCalledWith("ord-1", "refund_failed", expect.any(String), expect.any(Object));
    expect(sentText()).toContain("Our team will refund it manually");
  });

  it("does not refund when it can't tell how the fee was paid, and tells Staff it may be PayNow", async () => {
    for (const lookup of [() => h.method.mockRejectedValue(new Error("stripe timeout")), () => h.method.mockResolvedValue(null)]) {
      lookup();
      h.send.mockClear();
      h.telegram.mockClear();
      const out = await refundCancelledReadjustment(admin, booking(), "booked", "customer", early);
      expect(out.kind).toBe("failed");
      expect(String(h.telegram.mock.calls[0][0])).toContain("for PayNow you can add points instead");
      expect(sentText()).toMatch(/couldn't refund your SGD\s32\.70 automatically/);
    }
    expect(h.refund).not.toHaveBeenCalled();
  });

  it("does not tell the customer they were refunded when Stripe says the refund failed", async () => {
    h.refund.mockResolvedValue({ id: "re_1", amount: 3270, status: "failed" });
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "customer", early);
    expect(out).toEqual({ kind: "failed", error: "refund re_1 failed", fee: FEE });
    expect(h.timeline).not.toHaveBeenCalledWith("ord-1", "refund_initiated", expect.anything(), expect.anything());
    expect(sentText()).toContain("Our team will refund it manually");
  });

  it("emails nobody when the fee Order can't be read, since it may already be refunded", async () => {
    h.orderError = { message: "db down" };
    const out = await refundCancelledReadjustment(admin, booking(), "booked", "customer", early);
    expect(out).toEqual({ kind: "failed", error: "db down" });
    expect(h.telegram).toHaveBeenCalledTimes(1);
    expect(h.send).not.toHaveBeenCalled();
  });

  it("still refunds when the email can't be sent, or there is no address", async () => {
    h.send.mockRejectedValue(new Error("smtp down"));
    expect((await refundCancelledReadjustment(admin, booking(), "booked", "customer", early)).kind).toBe("refunded");
    h.send.mockClear();
    expect((await refundCancelledReadjustment(admin, booking({ email: null }), "booked", "customer", early)).kind).toBe(
      "refunded",
    );
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("markReadjustmentCancelledByEvent", () => {
  const early = new Date("2026-11-20T03:00:00Z");

  it("refunds the booking it moved to cancelled", async () => {
    h.moved = [booking()];
    await markReadjustmentCancelledByEvent("ev-1", "customer", { now: early }, admin);
    expect(h.refund).toHaveBeenCalledTimes(1);
  });

  it("emails the customer whose booking it cancelled, with the visit's studio", async () => {
    h.moved = [booking()];
    await markReadjustmentCancelledByEvent("ev-1", "customer", { now: early }, admin);
    const mail = h.send.mock.calls[0][0] as { to: string; text: string };
    expect(mail.to).toBe("ada@example.com");
    expect(mail.text).toContain("Mpillow Studio");
  });

  it("refunds nothing when another cancel already moved the booking", async () => {
    h.moved = [];
    await markReadjustmentCancelledByEvent("ev-1", "customer", { now: early }, admin);
    expect(h.refund).not.toHaveBeenCalled();
  });

  it("judges against the visit's live time, not the booked one, when Staff moved it in the calendar", async () => {
    h.moved = [booking({ start_at: "2026-11-21T02:00:00.000Z" })];
    const dayBeforeMovedVisit = new Date("2026-11-24T03:00:00Z");
    await markReadjustmentCancelledByEvent(
      "ev-1",
      "customer",
      { now: dayBeforeMovedVisit, startsAt: VISIT },
      admin,
    );
    expect(h.refund).toHaveBeenCalledTimes(1);
  });

  it("judges a decline by when the customer declined, not when we noticed", async () => {
    h.moved = [booking()];
    await markReadjustmentCancelledByEvent(
      "ev-1",
      "customer",
      { now: new Date("2026-11-25T00:30:00Z"), cancelledAt: new Date("2026-11-24T14:00:00Z") },
      admin,
    );
    expect(h.refund).toHaveBeenCalledTimes(1);
    expect(h.telegram).not.toHaveBeenCalled();
  });

  it("throws when the booking can't be cancelled, so the cancel is retried rather than lost", async () => {
    h.updateError = { message: "connection reset" };
    await expect(markReadjustmentCancelledByEvent("ev-1", "customer", { now: early }, admin)).rejects.toThrow(
      "connection reset",
    );
    expect(h.refund).not.toHaveBeenCalled();
  });
});
