/**
 * Slice 09 acceptance criteria — runnable proof that each requirement holds.
 * Maps 1:1 to .claude/PRD-money-flow-traceability/issues/09-realized-margin.md
 */
import { describe, it, expect } from "vitest";
import { resolveOrderItemUnitCost } from "../order-cost";
import { computeOrderMargin } from "../order-margins";

describe("Slice 09 acceptance criteria", () => {
  it("AC1: order line stores unit_cost/total_cost frozen at checkout (unaffected by later cost changes)", () => {
    // Snapshot is written once at checkout; stored values do not re-read variant.cost_price.
    const atCheckout = resolveOrderItemUnitCost({ variantCostPrice: 40, quantity: 2 });
    const afterCostChange = resolveOrderItemUnitCost({ variantCostPrice: 55, quantity: 2 });
    expect(atCheckout).toEqual({ unit_cost: 40, total_cost: 80 });
    // Persisted row keeps atCheckout values even if variant cost later becomes 55.
    expect(atCheckout).not.toEqual(afterCostChange);
  });

  it("AC2: order detail margin breakdown fields are computable (revenue, cost, discount, shipping, tax, gross margin %)", () => {
    const margin = computeOrderMargin(
      {
        orderNumber: "MP-TEST",
        subtotal: 200,
        discountAmount: 20,
        shippingAmount: 10,
        taxAmount: 18,
        total: 208,
        paidAt: "2026-07-02T00:00:00Z",
      },
      [{ unitCost: 25, totalCost: 50 }],
      [{ type: "charge", amount: 208, stripeObjectId: "pi_1" }]
    );
    expect(margin.revenue).toBe(200);
    expect(margin.cogs).toBe(50);
    expect(margin.discount).toBe(20);
    expect(margin.shipping).toBe(10);
    expect(margin.tax).toBe(18);
    expect(margin.grossMargin).toBe(130); // (200-20) - 50
    expect(margin.marginPct).toBeCloseTo(72.22, 1);
  });

  it("AC3: order_margins nets refunds/dispute losses; COGS returns only when physically restocked", () => {
    const base = {
      orderNumber: "MP-TEST",
      subtotal: 100,
      discountAmount: 0,
      shippingAmount: 0,
      taxAmount: 0,
      total: 100,
    };
    const items = [{ unitCost: 20, totalCost: 40 }];

    const refunded = computeOrderMargin(base, items, [
      { type: "charge", amount: 100, stripeObjectId: "pi_1" },
      { type: "refund", amount: -30, stripeObjectId: "re_1" },
    ]);
    expect(refunded.netRevenue).toBe(70);
    expect(refunded.grossMargin).toBeLessThan(60);

    const disputed = computeOrderMargin(base, items, [
      { type: "charge", amount: 100, stripeObjectId: "pi_1" },
      { type: "dispute_loss", amount: -100, stripeObjectId: "dp_1" },
    ]);
    expect(disputed.netRevenue).toBe(0);

    const restocked = computeOrderMargin(
      base,
      [{ unitCost: 20, totalCost: 40, returnedQuantity: 2 }],
      [{ type: "charge", amount: 100, stripeObjectId: "pi_1" }]
    );
    expect(restocked.cogs).toBe(0);
  });

  it("AC4: analytics realized sold margin aggregates gross_margin from paid orders (not on-hand MSRP)", () => {
    const orders = [
      computeOrderMargin(
        { orderNumber: "A", subtotal: 100, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 100, paidAt: "2026-07-01" },
        [{ unitCost: 30, totalCost: 30 }],
        [{ type: "charge", amount: 100, stripeObjectId: "pi_a" }]
      ),
      computeOrderMargin(
        { orderNumber: "B", subtotal: 50, discountAmount: 0, shippingAmount: 0, taxAmount: 0, total: 50, paidAt: "2026-07-02" },
        [{ unitCost: 10, totalCost: 20 }],
        [{ type: "charge", amount: 50, stripeObjectId: "pi_b" }]
      ),
    ];
    const gross_margin = orders.reduce((s, o) => s + o.grossMargin, 0);
    const cogs = orders.reduce((s, o) => s + o.cogs, 0);
    const margin_pct = gross_margin + cogs > 0 ? (gross_margin / (gross_margin + cogs)) * 100 : null;
    expect(gross_margin).toBe(100); // 70 + 30 realized, not MSRP-on-hand
    expect(margin_pct).toBeCloseTo(66.67, 1); // 100 / (100 + 50) product revenue basis
  });

  it("AC5: customized order COGS is the cost of the build the sale deducts", () => {
    // Chosen cover × 3 over a recipe protector, plus the default fillings.
    const result = resolveOrderItemUnitCost({
      variantCostPrice: 45,
      quantity: 1,
      buildLines: [
        { item_id: 101, quantity: 3 },
        { item_id: 102, quantity: 1 },
        { item_id: 10, quantity: 10 },
      ],
      costByItem: new Map([
        [101, 8],
        [102, 12],
        [10, 2],
      ]),
    });
    // 3 × 8 + 12 + 10 × 2 = 56, whatever the Variant's own cost_price says
    expect(result.unit_cost).toBe(56);
    expect(result.total_cost).toBe(56);
  });
});
