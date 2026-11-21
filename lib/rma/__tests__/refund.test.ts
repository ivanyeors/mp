import { describe, it, expect } from "vitest";
import { rmaRefundAmount } from "@/lib/rma/refund";

const twoPillowsTwentyOff = {
  order: { subtotal: 200, shipping_amount: 8, total: 168 },
  lines: [
    { id: "a", quantity: 1, total_price: 100 },
    { id: "b", quantity: 1, total_price: 100 },
  ],
};

describe("rmaRefundAmount", () => {
  it("returning one of two S$100.00 lines on a 20%-off Order refunds the S$80.00 paid for it, not its S$100.00 list price", () => {
    const { order, lines } = twoPillowsTwentyOff;
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "a", quantity: 1 }])).toBe(80);
  });

  it("never refunds the shipping, even when every line comes back", () => {
    const { order, lines } = twoPillowsTwentyOff;
    expect(
      rmaRefundAmount(order, lines, [
        { order_item_id: "a", quantity: 1 },
        { order_item_id: "b", quantity: 1 },
      ]),
    ).toBe(160);
  });

  it("spreads the share over every line of the Order, not only the returned ones", () => {
    const order = { subtotal: 150, shipping_amount: 0, total: 120 };
    const lines = [
      { id: "a", quantity: 2, total_price: 100 },
      { id: "b", quantity: 1, total_price: 50 },
    ];
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "a", quantity: 1 }])).toBe(40);
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "b", quantity: 1 }])).toBe(40);
  });

  it("on an Order charged 9% GST on top, a return gives back the line's tax with it: S$109.00 for a S$100.00 line", () => {
    const order = { subtotal: 200, shipping_amount: 8, total: 226 };
    const lines = [
      { id: "a", quantity: 1, total_price: 100 },
      { id: "b", quantity: 1, total_price: 100 },
    ];
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "a", quantity: 1 }])).toBe(109);
  });

  it("is zero for no items, and for a line that is not on the Order", () => {
    const { order, lines } = twoPillowsTwentyOff;
    expect(rmaRefundAmount(order, lines, [])).toBe(0);
    expect(rmaRefundAmount(order, lines, [{ order_item_id: "zzz", quantity: 1 }])).toBe(0);
  });
});
