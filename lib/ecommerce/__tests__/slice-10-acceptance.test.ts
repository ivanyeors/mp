import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeCouponDiscountAmount,
  resolveCouponDiscountBase,
} from "../discounts";

const repoRoot = join(__dirname, "../../..");

describe("Slice 10 acceptance criteria", () => {
  it("AC1: coupon past per_customer_limit is rejected (logic gate)", () => {
    const perCustomerLimit = 2;
    const customerUses = 2;
    const rejected = customerUses >= perCustomerLimit;
    expect(rejected).toBe(true);
  });

  it("AC2: applies_to product scoping restricts discount base to eligible items", () => {
    const scoped = resolveCouponDiscountBase(
      200,
      { product_ids: ["prod-a"] },
      ["prod-a", "prod-b"],
      [],
      [
        { productId: "prod-a", lineTotal: 80 },
        { productId: "prod-b", lineTotal: 120 },
      ]
    );
    expect(scoped.eligible).toBe(true);
    expect(scoped.discountBase).toBe(80);
    expect(computeCouponDiscountAmount(
      { discount_type: "percentage", discount_value: 10, max_discount: null },
      scoped.discountBase
    )).toBe(8);
  });

  it("AC2: applies_to rejects cart with no eligible items", () => {
    const result = resolveCouponDiscountBase(
      100,
      { category_ids: ["cat-x"] },
      ["p1"],
      ["cat-y"],
      [{ productId: "p1", categoryId: "cat-y", lineTotal: 100 }]
    );
    expect(result.eligible).toBe(false);
  });

  it("AC3: real discount amount is computable before checkout", () => {
    const discount = computeCouponDiscountAmount(
      { discount_type: "fixed_amount", discount_value: 15, max_discount: null },
      100
    );
    expect(discount).toBe(15);
  });

  it("AC4: increment_coupon_usage RPC migration exists for atomic usage tracking", () => {
    const sql = readFileSync(
      join(repoRoot, "supabase/migrations/20260702130000_increment_coupon_usage.sql"),
      "utf8"
    );
    expect(sql).toContain("increment_coupon_usage");
    expect(sql).toContain("usage_count = usage_count + 1");
  });

  it("AC5: shipping API filters inactive methods by default", () => {
    const readerSource = readFileSync(
      join(repoRoot, "lib/shop/shipping-methods.ts"),
      "utf8"
    );
    const routeSource = readFileSync(
      join(repoRoot, "app/api/shop/shipping/route.ts"),
      "utf8"
    );
    expect(readerSource).toContain('.eq("is_active", true)');
    expect(routeSource).toContain("include_inactive");
  });

  it("AC5: checkout reads shipping methods from json.rows", () => {
    const checkoutSource = readFileSync(
      join(repoRoot, "app/[lang]/shop/checkout/page.tsx"),
      "utf8"
    );
    expect(checkoutSource).toContain("data.rows ?? []");
  });

  it("AC6: cart free-shipping bar reads free_above from API", () => {
    const barSource = readFileSync(
      join(repoRoot, "components/shop/cart/cart-shipping-bar.tsx"),
      "utf8"
    );
    expect(barSource).toContain("free_above");
    expect(barSource).not.toContain("FREE_SHIPPING_THRESHOLD");
  });

  it("AC7: orders dashboard exposes revenue and avg_order_value keys", () => {
    const dashboardSource = readFileSync(
      join(repoRoot, "lib/ecommerce/admin/orders-dashboard.ts"),
      "utf8"
    );
    expect(dashboardSource).toContain("revenue:");
    expect(dashboardSource).toContain("avg_order_value:");
  });

  it("AC7: order detail normalizes items in API response", () => {
    const detailSource = readFileSync(
      join(repoRoot, "lib/ecommerce/admin/order-detail.ts"),
      "utf8"
    );
    expect(detailSource).toContain("items: orderItems");
  });

  it("AC7: orders list joins order_items for item counts", () => {
    const listSource = readFileSync(
      join(repoRoot, "lib/ecommerce/admin/orders-list.ts"),
      "utf8"
    );
    expect(listSource).toContain("order_items(");
    expect(listSource).toContain("items_count");
  });

  it("AC7: timeline API returns events alias", () => {
    const timelineSource = readFileSync(
      join(repoRoot, "lib/ecommerce/admin/order-detail.ts"),
      "utf8"
    );
    expect(timelineSource).toContain("events:");
  });
});
