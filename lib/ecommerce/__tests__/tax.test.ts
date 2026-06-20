import { describe, it, expect } from "vitest";
import {
  computeTax,
  computeOrderTotal,
  resolveTaxRule,
  DEFAULT_TAX_RULES,
  type TaxRule,
} from "@/lib/ecommerce/tax";

const SG_GST: TaxRule = {
  region: "SG",
  name: "GST",
  rate: 0.09,
  mode: "exclusive",
  appliesToShipping: true,
};

const MY_SST_INCLUSIVE: TaxRule = {
  region: "MY",
  name: "SST",
  rate: 0.06,
  mode: "inclusive",
  appliesToShipping: false,
};

const WILDCARD: TaxRule = {
  region: "*",
  name: "Tax",
  rate: 0.1,
  mode: "exclusive",
  appliesToShipping: true,
};

describe("computeTax — exclusive", () => {
  it("applies the rate to subtotal + shipping", () => {
    const tax = computeTax(
      { subtotal: 100, shippingAmount: 10, discountAmount: 0 },
      SG_GST
    );
    expect(tax.taxableBase).toBe(110);
    expect(tax.taxAmount).toBe(9.9); // 110 * 0.09
    expect(tax.rate).toBe(0.09);
    expect(tax.name).toBe("GST");
  });

  it("excludes shipping from the base when appliesToShipping is false", () => {
    const tax = computeTax(
      { subtotal: 100, shippingAmount: 10, discountAmount: 0 },
      { ...SG_GST, appliesToShipping: false }
    );
    expect(tax.taxableBase).toBe(100);
    expect(tax.taxAmount).toBe(9); // 100 * 0.09
  });

  it("reduces the taxable base by the discount", () => {
    const tax = computeTax(
      { subtotal: 100, shippingAmount: 0, discountAmount: 20 },
      SG_GST
    );
    expect(tax.taxableBase).toBe(80);
    expect(tax.taxAmount).toBe(7.2); // 80 * 0.09
  });

  it("rounds to 2 decimal places", () => {
    const tax = computeTax(
      { subtotal: 33.33, shippingAmount: 0, discountAmount: 0 },
      SG_GST
    );
    expect(tax.taxAmount).toBe(3); // 33.33 * 0.09 = 2.9997 -> 3.00
  });

  it("never lets a discount push the base below zero", () => {
    const tax = computeTax(
      { subtotal: 50, shippingAmount: 5, discountAmount: 999 },
      SG_GST
    );
    expect(tax.taxableBase).toBe(5); // discounted subtotal clamps to 0, + shipping
    expect(tax.taxAmount).toBe(0.45);
  });
});

describe("computeTax — inclusive", () => {
  it("extracts the embedded tax component", () => {
    const tax = computeTax(
      { subtotal: 106, shippingAmount: 0, discountAmount: 0 },
      MY_SST_INCLUSIVE
    );
    expect(tax.taxableBase).toBe(106);
    // 106 - 106 / 1.06 = 6
    expect(tax.taxAmount).toBe(6);
    expect(tax.mode).toBe("inclusive");
  });
});

describe("computeTax — no/zero rule", () => {
  it("returns zero tax when no rule applies", () => {
    const tax = computeTax(
      { subtotal: 100, shippingAmount: 10, discountAmount: 0 },
      null
    );
    expect(tax.taxAmount).toBe(0);
    expect(tax.rate).toBe(0);
  });

  it("returns zero tax for a 0% rule", () => {
    const tax = computeTax(
      { subtotal: 100, shippingAmount: 0, discountAmount: 0 },
      { ...SG_GST, rate: 0 }
    );
    expect(tax.taxAmount).toBe(0);
  });
});

describe("computeOrderTotal", () => {
  const input = { subtotal: 100, shippingAmount: 10, discountAmount: 20 };

  it("adds exclusive tax on top", () => {
    const tax = computeTax(input, SG_GST);
    // base = (100 - 20) + 10 = 90; tax = 90 * 0.09 = 8.1; total = 98.1
    expect(tax.taxAmount).toBe(8.1);
    expect(computeOrderTotal(input, tax)).toBe(98.1);
  });

  it("does not add inclusive tax again", () => {
    const inclusiveInput = { subtotal: 106, shippingAmount: 0, discountAmount: 0 };
    const tax = computeTax(inclusiveInput, MY_SST_INCLUSIVE);
    // total stays 106 (tax already embedded)
    expect(computeOrderTotal(inclusiveInput, tax)).toBe(106);
  });

  it("equals the untaxed base when there is no tax", () => {
    const tax = computeTax(input, null);
    expect(computeOrderTotal(input, tax)).toBe(90);
  });
});

describe("resolveTaxRule", () => {
  const rules = [SG_GST, MY_SST_INCLUSIVE, WILDCARD];

  it("matches a region case-insensitively", () => {
    expect(resolveTaxRule("sg", rules)).toBe(SG_GST);
    expect(resolveTaxRule("MY", rules)).toBe(MY_SST_INCLUSIVE);
  });

  it("falls back to the wildcard rule for unknown regions", () => {
    expect(resolveTaxRule("US", rules)).toBe(WILDCARD);
  });

  it("returns null when no rule and no wildcard match", () => {
    expect(resolveTaxRule("US", [SG_GST])).toBeNull();
    expect(resolveTaxRule("", [SG_GST])).toBeNull();
  });
});

describe("DEFAULT_TAX_RULES (confirmed rate model)", () => {
  it("is SG GST 9%, exclusive, subtotal only (shipping untaxed)", () => {
    const sg = resolveTaxRule("SG", DEFAULT_TAX_RULES);
    expect(sg).not.toBeNull();
    expect(sg?.rate).toBe(0.09);
    expect(sg?.mode).toBe("exclusive");
    expect(sg?.appliesToShipping).toBe(false);
    // Shipping is excluded from the base: tax is 9% of the subtotal only.
    const tax = computeTax(
      { subtotal: 200, shippingAmount: 50, discountAmount: 0 },
      sg
    );
    expect(tax.taxableBase).toBe(200);
    expect(tax.taxAmount).toBe(18);
  });

  it("does not tax non-SG regions", () => {
    expect(resolveTaxRule("US", DEFAULT_TAX_RULES)).toBeNull();
  });
});
