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
  const order = { subtotal: 120, shipping_amount: 8, total: 104 };
  const cushions = { id: "a", quantity: 2, total_price: 100 };
  const caseLine = { id: "b", quantity: 1, total_price: 20 };
  const lines = [cushions, caseLine];

  it("refunds a line's share of what was paid, after the discount", () => {
    expect(lineRefundAmount(order, lines, cushions, 2)).toBe(80);
    expect(lineRefundAmount(order, lines, cushions, 1)).toBe(40);
    expect(lineRefundAmount(order, lines, caseLine, 1)).toBe(16);
  });

  it("never refunds more units than the line holds", () => {
    expect(lineRefundAmount(order, lines, cushions, 5)).toBe(80);
    expect(lineRefundAmount(order, lines, cushions, 0)).toBe(0);
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
    const line = { id: "c", quantity: 3, total_price: 45 };
    expect(lineRefundAmount({ subtotal: 45, shipping_amount: 5, total: 50 }, [line], line, 1)).toBe(15);
  });

  const everyLine = (lines: Array<{ id: string; quantity: number }>) => ({
    items: lines.map((l) => ({ order_item_id: l.id, quantity: l.quantity })),
    shipping: true,
  });

  it("every line of an Order that took S$456.93 refunds S$456.93, not a cent over", () => {
    const order = { subtotal: 456.96, shipping_amount: 0, total: 456.93 };
    const lines = [
      { id: "a", quantity: 1, total_price: 152.32 },
      { id: "b", quantity: 1, total_price: 228.48 },
      { id: "c", quantity: 1, total_price: 76.16 },
    ];
    expect(selectionRefundAmount(order, lines, everyLine(lines))).toBe(456.93);
    expect(lines.map((l) => lineRefundAmount(order, lines, l, 1))).toEqual([152.31, 228.47, 76.15]);
  });

  it("three S$1.00 lines with a S$0.02 discount refund S$2.98, not a cent under", () => {
    const order = { subtotal: 3, shipping_amount: 0, total: 2.98 };
    const lines = ["a", "b", "c"].map((id) => ({ id, quantity: 1, total_price: 1 }));
    expect(selectionRefundAmount(order, lines, everyLine(lines))).toBe(2.98);
    expect(lines.map((l) => lineRefundAmount(order, lines, l, 1))).toEqual([1, 0.99, 0.99]);
  });

  it("a part of a line rounds up to the cent, so its units refunded one at a time never leave a cent behind", () => {
    const order = { subtotal: 3, shipping_amount: 0, total: 2.98 };
    const line = { id: "a", quantity: 3, total_price: 3 };
    expect(lineRefundAmount(order, [line], line, 1)).toBe(1);
    expect(lineRefundAmount(order, [line], line, 2)).toBe(1.99);
    expect(lineRefundAmount(order, [line], line, 3)).toBe(2.98);
  });

  it("a line's share does not depend on the order the lines arrive in", () => {
    const order = { subtotal: 3, shipping_amount: 0, total: 2.98 };
    const [a, b, c] = ["a", "b", "c"].map((id) => ({ id, quantity: 1, total_price: 1 }));
    const orderings = [[a, b, c], [a, c, b], [b, a, c], [b, c, a], [c, a, b], [c, b, a]];
    for (const lines of orderings) {
      expect(lines.map((l) => [l.id, lineRefundAmount(order, lines, l, 1)])).toEqual(
        expect.arrayContaining([["a", 1], ["b", 0.99], ["c", 0.99]]),
      );
    }
  });

  it("lines that add up to less than the subtotal get at most a cent above their floored share, and never more than was paid", () => {
    const order = { subtotal: 10, shipping_amount: 0, total: 5 };
    const lines = ["a", "b", "c"].map((id) => ({ id, quantity: 1, total_price: 1.01 }));
    expect(lines.map((l) => lineRefundAmount(order, lines, l, 1))).toEqual([0.51, 0.51, 0.51]);
    expect(selectionRefundAmount(order, lines, everyLine(lines))).toBe(1.53);
  });

  it("lines that add up to more than the subtotal are each floored, never rounded up", () => {
    const order = { subtotal: 2, shipping_amount: 0, total: 1 };
    const lines = ["a", "b", "c"].map((id) => ({ id, quantity: 1, total_price: 1.01 }));
    expect(lines.map((l) => lineRefundAmount(order, lines, l, 1))).toEqual([0.5, 0.5, 0.5]);
  });

  it("refunds nothing when the subtotal is not positive or the line holds nothing", () => {
    const empty = { id: "z", quantity: 0, total_price: 10 };
    expect(lineRefundAmount({ subtotal: 0, shipping_amount: 0, total: 10 }, [cushions], cushions, 2)).toBe(0);
    expect(lineRefundAmount(order, [cushions, empty], empty, 1)).toBe(0);
    expect(lineRefundAmount({ subtotal: 120, shipping_amount: 50, total: 20 }, lines, cushions, 2)).toBe(0);
  });
});

describe("splitRefundAcrossIntents", () => {
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
