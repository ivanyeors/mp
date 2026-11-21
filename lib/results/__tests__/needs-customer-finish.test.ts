import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsCustomerFinish } from "../needs-customer-finish";

const address = { recipient: "A", line1: "1 Road", city: "SG", postal_code: "123456", country: "SG" };

describe("needsCustomerFinish", () => {
  it("is true only for an assisted Result with no address", () => {
    expect(needsCustomerFinish({ source: "staff_assisted", shipping_address: null })).toBe(true);
    expect(needsCustomerFinish({ source: "staff_assisted", shipping_address: address })).toBe(false);
  });

  it("never reads an in-store or online Result as unfinished", () => {
    expect(needsCustomerFinish({ source: "manual", shipping_address: null })).toBe(false);
    expect(needsCustomerFinish({ source: "online_purchase", shipping_address: null })).toBe(false);
    expect(needsCustomerFinish({ source: null, shipping_address: null })).toBe(false);
  });
});

describe("guards keyed on it", () => {
  it("accept refuses before any lifecycle transition or Stripe call", () => {
    const src = readFileSync("app/api/results/[id]/accept/route.ts", "utf8");
    const guard = src.indexOf("if (needsCustomerFinish(row))");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("transitionResult("));
    expect(guard).toBeLessThan(src.indexOf("createTopUpCheckout("));
  });

  it("finish writes only while the Result is still assigned and unfinished", () => {
    const src = readFileSync("app/api/results/[id]/finish/route.ts", "utf8");
    expect(src).toMatch(/requireResultAccess\(row, input\.token \?\? null[,)]/);
    expect(src).toMatch(/row\.status !== "assigned" \|\| !needsCustomerFinish\(row\)/);
    expect(src).toMatch(/\.eq\("status", "assigned"\)\s*\.is\("shipping_address", null\)/);
  });

  it("the hold submit links no signed-in account to an assisted Result", () => {
    const src = readFileSync("app/api/results/hold/route.ts", "utf8");
    expect(src).toMatch(/customer_id: input\.deferred \? null : customerId/);
  });
});
