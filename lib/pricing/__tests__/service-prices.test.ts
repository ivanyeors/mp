import { describe, expect, it } from "vitest";

import {
  DEFAULT_READJUSTMENT_POLICY,
  isServiceKey,
  parseReadjustmentPolicy,
  parseServicePrices,
} from "@/lib/pricing/service-prices";

const rows = [
  { key: "measurement_premium", msrp: "50.00", cost_price: null, currency: "SGD" },
  { key: "measurement_basic", msrp: 30, cost_price: "5.50", currency: "SGD" },
  { key: "readjustment", msrp: "30.00", cost_price: null, currency: null },
];

describe("parseServicePrices", () => {
  it("reads all three services", () => {
    const prices = parseServicePrices(rows);
    expect(prices.measurement_premium).toEqual({ msrp: 50, costPrice: null, currency: "SGD" });
    expect(prices.measurement_basic).toEqual({ msrp: 30, costPrice: 5.5, currency: "SGD" });
    expect(prices.readjustment.currency).toBe("SGD");
  });

  it("throws rather than pricing a missing service at zero", () => {
    expect(() => parseServicePrices(rows.slice(0, 2))).toThrow(/readjustment/);
  });

  it("throws on a null or negative MSRP", () => {
    expect(() =>
      parseServicePrices([...rows.slice(0, 2), { key: "readjustment", msrp: null, cost_price: null, currency: "SGD" }]),
    ).toThrow();
    expect(() =>
      parseServicePrices([...rows.slice(0, 2), { key: "readjustment", msrp: -1, cost_price: null, currency: "SGD" }]),
    ).toThrow();
  });

  it("ignores unknown keys", () => {
    expect(() =>
      parseServicePrices([...rows, { key: "doorstep", msrp: 250, cost_price: null, currency: "SGD" }]),
    ).not.toThrow();
  });
});

describe("isServiceKey", () => {
  it("accepts only the closed set", () => {
    expect(isServiceKey("readjustment")).toBe(true);
    expect(isServiceKey("doorstep")).toBe(false);
    expect(isServiceKey(null)).toBe(false);
  });
});

describe("parseReadjustmentPolicy", () => {
  it("reads stored integers", () => {
    expect(
      parseReadjustmentPolicy({ readjustment_free_visits: "2", readjustment_free_window_days: "90" }),
    ).toEqual({ freeVisits: 2, freeWindowDays: 90 });
  });

  it("allows zero (no complimentary visit)", () => {
    expect(parseReadjustmentPolicy({ readjustment_free_visits: "0" }).freeVisits).toBe(0);
  });

  it("falls back per key on garbage, negatives, fractions and out-of-range values", () => {
    expect(parseReadjustmentPolicy({})).toEqual(DEFAULT_READJUSTMENT_POLICY);
    expect(
      parseReadjustmentPolicy({ readjustment_free_visits: "abc", readjustment_free_window_days: "-5" }),
    ).toEqual(DEFAULT_READJUSTMENT_POLICY);
    expect(
      parseReadjustmentPolicy({ readjustment_free_visits: "1.5", readjustment_free_window_days: "400" }),
    ).toEqual(DEFAULT_READJUSTMENT_POLICY);
  });
});
