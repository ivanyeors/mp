import { describe, it, expect } from "vitest";
import { rmaRefundAmount, type RmaRefundOrder } from "@/lib/rma/refund";

const goods = (id: string, price: number) => ({ id, quantity: 1, total_price: price, unit_price: price, kind: "goods", customization_snapshot: null });
const service = (id: string, price: number) => ({ id, quantity: 1, total_price: price, unit_price: price, kind: "service", customization_snapshot: null });
const twoHundredDollarLines = [goods("a", 100), goods("b", 100)];
const one = [{ order_item_id: "a", quantity: 1 }];
const onlyB = [{ order_item_id: "b", quantity: 1 }];
const both = [
  { order_item_id: "a", quantity: 1 },
  { order_item_id: "b", quantity: 1 },
];

const orderWide = { applies_to: null };
const order = (o: Partial<RmaRefundOrder>): RmaRefundOrder => ({
  subtotal: 200,
  shipping_amount: 0,
  discount_amount: 0,
  points_discount: 0,
  total: 200,
  self_purchase_units: 0,
  coupons: null,
  ...o,
});

describe("rmaRefundAmount", () => {
  it.each([
    { label: "20% coupon, paid 160", o: { discount_amount: 40, total: 160, coupons: orderWide }, which: "one", expected: 80 },
    { label: "20% coupon, paid 160", o: { discount_amount: 40, total: 160, coupons: orderWide }, which: "both", expected: 160 },
    { label: "50 in points, paid 150", o: { discount_amount: 50, points_discount: 50, total: 150 }, which: "one", expected: 100 },
    { label: "50 in points, paid 150", o: { discount_amount: 50, points_discount: 50, total: 150 }, which: "both", expected: 200 },
    { label: "20% coupon then 50 points, paid 110", o: { discount_amount: 90, points_discount: 50, total: 110, coupons: orderWide }, which: "one", expected: 80 },
    { label: "20% coupon then 50 points, paid 110", o: { discount_amount: 90, points_discount: 50, total: 110, coupons: orderWide }, which: "both", expected: 160 },
    { label: "50 points and 8 shipping, paid 158", o: { shipping_amount: 8, discount_amount: 50, points_discount: 50, total: 158 }, which: "both", expected: 200 },
    { label: "points_discount null is no points", o: { discount_amount: 40, points_discount: null, total: 160, coupons: orderWide }, which: "one", expected: 80 },
  ] as const)("two lines of 100.00 each, $label: returning $which line(s) works out $expected before the refundable cap", ({ o, which, expected }) => {
    expect(rmaRefundAmount(order(o), twoHundredDollarLines, which === "one" ? one : both)).toBe(expected);
  });

  it("a code scoped to product A (50% off A, paid 150) falls back to the list price: B gives back 100, and so does A", () => {
    const scoped = order({ discount_amount: 50, total: 150, coupons: { applies_to: { product_ids: ["prod-a"] } } });
    expect(rmaRefundAmount(scoped, twoHundredDollarLines, onlyB)).toBe(100);
    expect(rmaRefundAmount(scoped, twoHundredDollarLines, one)).toBe(100);
  });

  it("a code scoped to a category falls back to the list price too", () => {
    const scoped = order({ discount_amount: 40, total: 160, coupons: { applies_to: { category_ids: ["cat-1"] } } });
    expect(rmaRefundAmount(scoped, twoHundredDollarLines, one)).toBe(100);
  });

  it("an Order whose coupon row is gone, with money off beyond its points, falls back to the list price", () => {
    const gone = order({ discount_amount: 60, points_discount: 20, total: 140, coupons: null });
    expect(rmaRefundAmount(gone, twoHundredDollarLines, one)).toBe(100);
  });

  it("a staff Order with a service line and a code refunds the list price of the returned goods", () => {
    const lines = [goods("a", 100), goods("b", 100), service("s", 50)];
    const staff = order({ subtotal: 250, discount_amount: 40, total: 210, coupons: orderWide });
    expect(rmaRefundAmount(staff, lines, one)).toBe(100);
  });

  it("no coupon, with a service line, keeps the paid share: with 9% GST a 100.00 line gives back 109.00, not its list price", () => {
    const lines = [goods("a", 100), goods("b", 100), service("s", 50)];
    expect(rmaRefundAmount(order({ subtotal: 250, total: 272.5 }), lines, one)).toBe(109);
    const pointsOnly = order({ subtotal: 250, discount_amount: 50, points_discount: 50, total: 218 });
    expect(rmaRefundAmount(pointsOnly, lines, one)).toBe(107.2);
  });

  it("a 30% partner self-purchase with a free-shipping code (pillow 200, case 100, paid 240) refunds the case at its list price, 100", () => {
    const lines = [goods("pillow", 200), goods("case", 100)];
    const partner = order({ subtotal: 300, discount_amount: 60, total: 240, self_purchase_units: 1, coupons: orderWide });
    expect(rmaRefundAmount(partner, lines, [{ order_item_id: "case", quantity: 1 }])).toBe(100);
  });

  it("a partner self-purchase Order with no code refunds the list price", () => {
    const lines = [goods("pillow", 200), goods("case", 100)];
    const partner = order({ subtotal: 300, discount_amount: 60, total: 240, self_purchase_units: 1 });
    expect(rmaRefundAmount(partner, lines, [{ order_item_id: "case", quantity: 1 }])).toBe(100);
  });

  it("a paired Result Order with a 10% code on the anchor (pillow 300, bolster 100, paid 370) refunds the bolster at its list price, 100", () => {
    const build = (product_type: string) => ({ result_id: `res-${product_type}`, product_type, build_lines: [] });
    const lines = [
      { ...goods("pillow", 300), customization_snapshot: build("pillow") },
      { ...goods("bolster", 100), customization_snapshot: build("bolster") },
    ];
    const paired = order({ subtotal: 400, discount_amount: 30, total: 370, coupons: orderWide });
    expect(rmaRefundAmount(paired, lines, [{ order_item_id: "bolster", quantity: 1 }])).toBe(100);
  });

  it("an empty applies_to scope counts as Order-wide", () => {
    const wide = order({ discount_amount: 40, total: 160, coupons: { applies_to: { product_ids: [], category_ids: [] } } });
    expect(rmaRefundAmount(wide, twoHundredDollarLines, one)).toBe(80);
  });

  it("on an Order with no points, every line back refunds exactly total less shipping, so the shipping is kept", () => {
    const shipped = order({ shipping_amount: 8, discount_amount: 40, total: 168, coupons: orderWide });
    expect(rmaRefundAmount(shipped, twoHundredDollarLines, both)).toBe(160);
  });

  it("spreads the share over every line of the Order, not only the returned ones", () => {
    const lines = [
      { id: "a", quantity: 2, total_price: 100, unit_price: 50, kind: "goods", customization_snapshot: null },
      { id: "b", quantity: 1, total_price: 50, unit_price: 50, kind: "goods", customization_snapshot: null },
    ];
    const o = order({ subtotal: 150, discount_amount: 30, total: 120, coupons: orderWide });
    expect(rmaRefundAmount(o, lines, [{ order_item_id: "a", quantity: 1 }])).toBe(40);
    expect(rmaRefundAmount(o, lines, [{ order_item_id: "b", quantity: 1 }])).toBe(40);
  });

  it("on an Order charged 9% GST on top, a return gives back the line's tax with it: 109.00 for a 100.00 line", () => {
    expect(rmaRefundAmount(order({ shipping_amount: 8, total: 226 }), twoHundredDollarLines, one)).toBe(109);
  });

  it("is zero for no items, and for a line that is not on the Order", () => {
    const o = order({ discount_amount: 40, total: 160, coupons: orderWide });
    expect(rmaRefundAmount(o, twoHundredDollarLines, [])).toBe(0);
    expect(rmaRefundAmount(o, twoHundredDollarLines, [{ order_item_id: "zzz", quantity: 1 }])).toBe(0);
  });
});
