import { describe, expect, it } from "vitest";

import {
  measurementServiceKey,
  resultServiceLines,
  sumServiceLines,
} from "@/lib/pricing/service-lines";
import type { ServicePrices } from "@/lib/pricing/service-prices";

const prices: ServicePrices = {
  measurement_premium: { msrp: 50, costPrice: null, currency: "SGD" },
  measurement_basic: { msrp: 30, costPrice: 4, currency: "SGD" },
  readjustment: { msrp: 30, costPrice: null, currency: "SGD" },
};

describe("measurementServiceKey — the fee follows who measured (ADR 0024)", () => {
  it.each([
    // [who measured, product, assigned tier, suggested tier, expected]
    ["by_user", "pillow", null, "premium", null],
    [null, "pillow", null, "premium", null],
    ["staff", "pillow", null, "premium", "measurement_premium"],
    ["staff", "pillow", null, "basic", "measurement_basic"],
    // Staff changed the tier at assign, or the shopper accepted an upsell.
    ["staff", "pillow", "premium", "basic", "measurement_premium"],
    ["staff", "pillow", "basic", "premium", "measurement_basic"],
    // Mbolster carries no measurement fee, whoever measured.
    ["staff", "bolster", null, null, null],
    ["by_user", "bolster", null, null, null],
  ])("%s / %s / assigned %s / suggested %s → %s", (who, product, assigned, suggested, expected) => {
    expect(
      measurementServiceKey({
        measured_by_type: who,
        product_type: product,
        assigned_tier: assigned,
        suggested_tier: suggested,
      }),
    ).toBe(expected);
  });
});

describe("resultServiceLines", () => {
  it("prices a Staff-measured Premium Result at the Premium fee", () => {
    expect(
      resultServiceLines({ measured_by_type: "staff", product_type: "pillow", suggested_tier: "premium" }, prices),
    ).toEqual([{ key: "measurement_premium", label: "Measurement service (Premium)", msrp: 50, costPrice: null }]);
  });

  it("carries the service's cost for margin", () => {
    const [line] = resultServiceLines(
      { measured_by_type: "staff", product_type: "pillow", suggested_tier: "basic" },
      prices,
    );
    expect(line).toMatchObject({ key: "measurement_basic", msrp: 30, costPrice: 4 });
  });

  it("charges a Staff-measured bolster nothing, even with no prices loaded", () => {
    expect(resultServiceLines({ measured_by_type: "staff", product_type: "bolster" }, prices)).toEqual([]);
    expect(resultServiceLines({ measured_by_type: "staff", product_type: "bolster" }, null)).toEqual([]);
  });

  it("owes nothing for a self-measured Result, with or without prices", () => {
    expect(resultServiceLines({ measured_by_type: "by_user", product_type: "pillow" }, prices)).toEqual([]);
    expect(resultServiceLines({ measured_by_type: "by_user", product_type: "pillow" }, null)).toEqual([]);
  });

  it("throws rather than reading an owed fee as free when prices are missing", () => {
    expect(() => resultServiceLines({ measured_by_type: "staff", product_type: "pillow" }, null)).toThrow();
  });

  it("sums lines", () => {
    expect(sumServiceLines([{ msrp: 50 }, { msrp: 30 }])).toBe(80);
    expect(sumServiceLines([])).toBe(0);
  });
});
