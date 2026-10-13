import { describe, it, expect } from "vitest";
import { priceResult } from "@/lib/result-pricing";

/**
 * `priceResult` used to own the goods rule as "composed MSRP + every preference
 * MSRP". That double-charged: a Costings row is the price of a whole configuration,
 * so adding the chosen cover and case on top billed 473 for a 360 pillow. The goods
 * rule now lives in `priceComposedBuild` (see lib/pricing/__tests__), and this owns
 * the sums: goods + Service fees + shipping + tax.
 */
describe("priceResult", () => {
  it("adds shipping and tax to the goods subtotal", () => {
    const priced = priceResult({ goods: 155, shipping: 8, tax: 12 });
    expect(priced.subtotal).toBe(155);
    expect(priced.shipping).toBe(8);
    expect(priced.tax).toBe(12);
    expect(priced.total).toBe(175);
  });

  it("defaults services, shipping and tax to zero", () => {
    const priced = priceResult({ goods: 100 });
    expect(priced).toEqual({ goods: 100, services: 0, subtotal: 100, shipping: 0, tax: 0, total: 100 });
  });

  it("keeps Service fees beside goods, not inside them (ADR 0024)", () => {
    const priced = priceResult({ goods: 360, services: 50, shipping: 8, tax: 0 });
    expect(priced.goods).toBe(360);
    expect(priced.services).toBe(50);
    expect(priced.subtotal).toBe(410);
    expect(priced.total).toBe(418);
  });

  it("is a pure function of its numbers — fillings cannot reach it", () => {
    const a = priceResult({ goods: 50, shipping: 3, tax: 1 });
    const b = priceResult({ goods: 50, shipping: 3, tax: 1 });
    expect(a.total).toBe(54);
    expect(a).toEqual(b);
  });
});
