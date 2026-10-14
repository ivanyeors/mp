import { describe, expect, it } from "vitest";

import {
  buildPurchaseList,
  classifyOrderLine,
  purchaseLabel,
  type OrderLineRow,
  type OrderRow,
} from "@/lib/readjustment/purchases";

const pillowById = new Map([
  [11, { size: "M", kind: "premium" }],
  [12, { size: "S", kind: "basic" }],
]);

const line = (extra: Partial<OrderLineRow>): OrderLineRow => ({
  id: "line",
  kind: "goods",
  quantity: 1,
  returned_quantity: 0,
  product_title: "x",
  variant_title: null,
  image_url: null,
  customization_snapshot: null,
  product_variants: null,
  ...extra,
});

describe("classifyOrderLine", () => {
  it("reads a Result order from its build snapshot", () => {
    expect(
      classifyOrderLine(
        line({
          customization_snapshot: {
            result_id: "r1",
            product_type: "pillow",
            assigned_size: "L",
            assigned_tier: "premium",
          },
        }),
        pillowById,
      ),
    ).toEqual({ productType: "pillow", tier: "premium", size: "L", length: null });
  });

  it("reads a shop pillow variant through its pillow product", () => {
    expect(
      classifyOrderLine(
        line({ product_variants: { pillow_product_id: 12, products: { product_type: "pillow" } } }),
        pillowById,
      ),
    ).toEqual({ productType: "pillow", tier: "basic", size: "S", length: null });
  });

  it("reads a bolster's length from its price key, then its option", () => {
    expect(
      classifyOrderLine(
        line({ product_variants: { price_key: "product:bolster:long", products: { product_type: "bolster" } } }),
        pillowById,
      ),
    ).toMatchObject({ productType: "bolster", length: "long" });
    expect(
      classifyOrderLine(
        line({ product_variants: { option1: "Medium", products: { product_type: "bolster" } } }),
        pillowById,
      ),
    ).toMatchObject({ productType: "bolster", length: "medium" });
  });

  it("reads a legacy cart customisation from its snapshot's pillow product", () => {
    expect(
      classifyOrderLine(line({ customization_snapshot: { pillow_product_id: 11 } }), pillowById),
    ).toMatchObject({ productType: "pillow", tier: "premium", size: "M" });
  });

  it("ignores accessories and Service fee lines", () => {
    expect(
      classifyOrderLine(line({ product_variants: { products: { product_type: "accessory" } } }), pillowById),
    ).toBeNull();
    expect(
      classifyOrderLine(
        line({ kind: "service", customization_snapshot: { result_id: "r", product_type: "pillow" } }),
        pillowById,
      ),
    ).toBeNull();
  });
});

describe("purchaseLabel", () => {
  it("names the product the way the customer knows it", () => {
    expect(purchaseLabel({ productType: "pillow", tier: "premium", size: "M", length: null })).toBe(
      "Premium Mpillow · Size M",
    );
    expect(purchaseLabel({ productType: "bolster", tier: null, size: null, length: "short" })).toBe(
      "Mbolster · Short",
    );
    expect(purchaseLabel({ productType: "pillow", tier: null, size: null, length: null })).toBe("Mpillow");
  });
});

describe("buildPurchaseList", () => {
  const premiumLine = line({
    id: "p1",
    customization_snapshot: { result_id: "r1", product_type: "pillow", assigned_size: "M", assigned_tier: "premium" },
  });
  const orders: OrderRow[] = [
    { id: "o-old", order_number: "1001", paid_at: "2026-01-05T02:00:00Z", status: "delivered", order_items: [
      line({ id: "b1", product_variants: { price_key: "product:bolster:short", products: { product_type: "bolster" } } }),
    ] },
    { id: "o-new", order_number: "1042", paid_at: "2026-09-03T02:00:00Z", status: "delivered", order_items: [
      premiumLine,
      line({ id: "acc", product_variants: { products: { product_type: "accessory" } } }),
      line({ id: "svc", kind: "service" }),
    ] },
    { id: "o-pending", order_number: "1050", paid_at: null, status: "pending", order_items: [premiumLine] },
    { id: "o-refunded", order_number: "1051", paid_at: "2026-09-04T02:00:00Z", status: "refunded", order_items: [
      line({ id: "r1", customization_snapshot: { result_id: "x", product_type: "pillow", assigned_tier: "premium" } }),
    ] },
  ];

  const list = buildPurchaseList({
    orders,
    pillowById,
    usedSeqsByItem: new Map(),
    policy: { freeVisits: 1, freeWindowDays: 60 },
    fee: 30,
    today: "2026-09-10",
  });

  it("lists only paid pillows and bolsters, newest first", () => {
    expect(list.map((p) => p.orderItemId)).toEqual(["p1", "b1"]);
    expect(list[0]).toMatchObject({ orderNumber: "1042", label: "Premium Mpillow · Size M" });
  });

  it("quotes each line: the recent Premium is free, the bolster pays", () => {
    expect(list[0].quote).toMatchObject({ complimentary: true, freeUntil: "2026-11-02" });
    expect(list[1].quote).toMatchObject({ complimentary: false, fee: 30, reason: "not_premium" });
  });

  it("drops a line whose every unit was returned", () => {
    const returned = buildPurchaseList({
      orders: [{ ...orders[1], order_items: [{ ...premiumLine, returned_quantity: 1 }] }],
      pillowById,
      usedSeqsByItem: new Map(),
      policy: { freeVisits: 1, freeWindowDays: 60 },
      fee: 30,
      today: "2026-09-10",
    });
    expect(returned).toEqual([]);
  });

  it("charges a line whose free visit is already booked", () => {
    const used = buildPurchaseList({
      orders,
      pillowById,
      usedSeqsByItem: new Map([["p1", [1]]]),
      policy: { freeVisits: 1, freeWindowDays: 60 },
      fee: 30,
      today: "2026-09-10",
    });
    expect(used[0].quote).toMatchObject({ complimentary: false, reason: "free_visit_used" });
  });
});
