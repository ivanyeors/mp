import { describe, it, expect } from "vitest";
import {
  refundableAmount,
  refundIdempotencyKey,
  cancelRefundIdempotencyKey,
  isPaidOrder,
  lineRefundAmount,
  selectionRefundAmount,
  splitRefundAcrossIntents,
  staffRefundIdempotencyKey,
  stripeRefundReason,
} from "../admin-refund";

describe("refundableAmount", () => {
  it("returns remaining balance after partial refunds", () => {
    expect(refundableAmount({ total: 100, amount_refunded: 30 })).toBe(70);
  });

  it("never goes negative", () => {
    expect(refundableAmount({ total: 50, amount_refunded: 60 })).toBe(0);
  });

  it("caps at what was captured, not the order total", () => {
    // A Result order topped up beyond its hold is paid by two intents; only what a
    // charge actually brought in can be refunded.
    expect(
      refundableAmount({ total: 500, amount_captured: 420, amount_refunded: 20 })
    ).toBe(400);
  });

  it("falls back to total when no capture has been rolled up", () => {
    expect(refundableAmount({ total: 100, amount_captured: 0, amount_refunded: 0 })).toBe(100);
  });
});

describe("idempotency keys", () => {
  it("stabilizes admin refund keys per order and amount", () => {
    expect(refundIdempotencyKey("ord-1", 5000)).toBe("admin_refund_ord-1_5000");
    expect(cancelRefundIdempotencyKey("ord-1", 5000)).toBe("admin_cancel_ord-1_5000");
  });
});

describe("isPaidOrder", () => {
  it("treats captured paid orders as paid", () => {
    expect(
      isPaidOrder({
        payment_reference: "pi_1",
        paid_at: "2026-01-01T00:00:00Z",
        status: "confirmed",
        amount_captured: 100,
      })
    ).toBe(true);
  });

  it("treats pending orders as unpaid even with a payment reference", () => {
    expect(
      isPaidOrder({
        payment_reference: "pi_1",
        paid_at: null,
        status: "pending",
        amount_captured: 0,
      })
    ).toBe(false);
  });
});

describe("staff refund idempotency", () => {
  it("keys on the dialog's request and the intent, not the amount", () => {
    // Two separate S$10 mistakes are two refunds; a double-click on one is one.
    expect(staffRefundIdempotencyKey("ord-1", "req-a", "pi_1")).not.toBe(
      staffRefundIdempotencyKey("ord-1", "req-b", "pi_1"),
    );
    expect(staffRefundIdempotencyKey("ord-1", "req-a", "pi_1")).toBe("admin_refund_ord-1_req-a_pi_1");
  });
});

describe("stripeRefundReason", () => {
  it("sends Stripe its own reason, or none for a charging mistake", () => {
    expect(stripeRefundReason("duplicate")).toBe("duplicate");
    expect(stripeRefundReason("returned")).toBe("requested_by_customer");
    expect(stripeRefundReason("charged_in_error")).toBeUndefined();
    expect(stripeRefundReason("other")).toBeUndefined();
  });
});

describe("item refund amounts", () => {
  // Two S$50 cushions and a S$20 case: S$120 of goods, S$24 off (coupon and
  // points), S$8 shipping. The customer paid S$104 in cash.
  const order = { subtotal: 120, shipping_amount: 8, total: 104 };
  const cushions = { id: "a", quantity: 2, total_price: 100 };
  const caseLine = { id: "b", quantity: 1, total_price: 20 };

  it("refunds a line's share of what was paid, after the discount", () => {
    // 100/120 of the S$96 paid for goods.
    expect(lineRefundAmount(order, cushions, 2)).toBe(80);
    expect(lineRefundAmount(order, cushions, 1)).toBe(40);
    expect(lineRefundAmount(order, caseLine, 1)).toBe(16);
  });

  it("never refunds more units than the line holds", () => {
    expect(lineRefundAmount(order, cushions, 5)).toBe(80);
    expect(lineRefundAmount(order, cushions, 0)).toBe(0);
  });

  it("every line plus shipping is exactly what was paid", () => {
    expect(
      selectionRefundAmount(order, [cushions, caseLine], {
        items: [
          { order_item_id: "a", quantity: 2 },
          { order_item_id: "b", quantity: 1 },
        ],
        shipping: true,
      }),
    ).toBe(104);
  });

  it("adds the shipping only when asked, and ignores lines not on the order", () => {
    const sel = { items: [{ order_item_id: "b", quantity: 1 }, { order_item_id: "zzz", quantity: 1 }] };
    expect(selectionRefundAmount(order, [cushions, caseLine], { ...sel, shipping: false })).toBe(16);
    expect(selectionRefundAmount(order, [cushions, caseLine], { ...sel, shipping: true })).toBe(24);
  });

  it("an undiscounted order refunds list price", () => {
    expect(lineRefundAmount({ subtotal: 45, shipping_amount: 5, total: 50 }, { id: "c", quantity: 3, total_price: 45 }, 1)).toBe(15);
  });
});

describe("splitRefundAcrossIntents", () => {
  // A Result held at S$300 and topped up S$120 (ADR 0016).
  const balances = [
    { paymentIntentId: "pi_hold", refundableCents: 30000 },
    { paymentIntentId: "pi_topup", refundableCents: 12000 },
  ];

  it("one refund when one charge covers it, from the larger", () => {
    expect(splitRefundAcrossIntents(5000, balances)).toEqual([{ paymentIntentId: "pi_hold", cents: 5000 }]);
  });

  it("spills into the next charge past what the first can refund", () => {
    expect(splitRefundAcrossIntents(42000, balances)).toEqual([
      { paymentIntentId: "pi_hold", cents: 30000 },
      { paymentIntentId: "pi_topup", cents: 12000 },
    ]);
  });

  it("skips a charge already refunded, and refuses more than is left", () => {
    expect(
      splitRefundAcrossIntents(1000, [
        { paymentIntentId: "pi_hold", refundableCents: 0 },
        { paymentIntentId: "pi_topup", refundableCents: 1000 },
      ]),
    ).toEqual([{ paymentIntentId: "pi_topup", cents: 1000 }]);
    expect(splitRefundAcrossIntents(42001, balances)).toBeNull();
  });
});
