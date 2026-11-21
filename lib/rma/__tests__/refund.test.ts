import { describe, it, expect } from "vitest";
import { rmaRefundAmount } from "@/lib/rma/refund";

const twoHundredDollarLines = [
  { id: "a", quantity: 1, total_price: 100 },
  { id: "b", quantity: 1, total_price: 100 },
];
const one = [{ order_item_id: "a", quantity: 1 }];
const both = [
  { order_item_id: "a", quantity: 1 },
  { order_item_id: "b", quantity: 1 },
];

describe("rmaRefundAmount", () => {
  it.each([
    { label: "20% coupon, paid S$160", order: { subtotal: 200, shipping_amount: 0, points_discount: 0, total: 160 }, which: "one", expected: 80 },
    { label: "20% coupon, paid S$160", order: { subtotal: 200, shipping_amount: 0, points_discount: 0, total: 160 }, which: "both", expected: 160 },
    { label: "S$50 in points, paid S$150", order: { subtotal: 200, shipping_amount: 0, points_discount: 50, total: 150 }, which: "one", expected: 100 },
    { label: "S$50 in points, paid S$150", order: { subtotal: 200, shipping_amount: 0, points_discount: 50, total: 150 }, which: "both", expected: 150 },
    { label: "20% coupon then S$50 points, paid S$110", order: { subtotal: 200, shipping_amount: 0, points_discount: 50, total: 110 }, which: "one", expected: 80 },
    { label: "20% coupon then S$50 points, paid S$110", order: { subtotal: 200, shipping_amount: 0, points_discount: 50, total: 110 }, which: "both", expected: 110 },
    { label: "S$50 points and S$8 shipping, paid S$158", order: { subtotal: 200, shipping_amount: 8, points_discount: 50, total: 158 }, which: "both", expected: 150 },
    { label: "points_discount null is no points", order: { subtotal: 200, shipping_amount: 0, points_discount: null, total: 160 }, which: "one", expected: 80 },
  ] as const)("two lines of 100.00 each, $label: returning $which line(s) refunds $expected", ({ order, which, expected }) => {
    expect(rmaRefundAmount(order, twoHundredDollarLines, which === "one" ? one : both)).toBe(expected);
  });

  it("never refunds the shipping, even when every line comes back", () => {
    const order = { subtotal: 200, shipping_amount: 8, points_discount: 0, total: 168 };
    expect(rmaRefundAmount(order, twoHundredDollarLines, both)).toBe(160);
  });

  it("spreads the share over every line of the Order, not only the returned ones", () => {
    const order = { subtotal: 150, shipping_amount: 0, points_discount: 0, total: 120 };
    const lines = [
      { id: "a", quantity: 2, total_price: 100 },
      { id: "b", quantity: 1, total_price: 50 },
    ];
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "a", quantity: 1 }])).toBe(40);
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "b", quantity: 1 }])).toBe(40);
  });

  it("on an Order charged 9% GST on top, a return gives back the line's tax with it: S$109.00 for a S$100.00 line", () => {
    const order = { subtotal: 200, shipping_amount: 8, points_discount: 0, total: 226 };
    expect(rmaRefundAmount(order, twoHundredDollarLines, one)).toBe(109);
  });

  it("is zero for no items, and for a line that is not on the Order", () => {
    const order = { subtotal: 200, shipping_amount: 8, points_discount: 0, total: 168 };
    expect(rmaRefundAmount(order, twoHundredDollarLines, [])).toBe(0);
    expect(rmaRefundAmount(order, twoHundredDollarLines, [{ order_item_id: "zzz", quantity: 1 }])).toBe(0);
  });
});
