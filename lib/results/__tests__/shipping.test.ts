import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const h = vi.hoisted(() => ({ quoteShippingMethods: vi.fn() }));
vi.mock("@/lib/shipping/quote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shipping/quote")>()),
  quoteShippingMethods: h.quoteShippingMethods,
}));
vi.mock("@/lib/shipping/settings", () => ({
  readShippingSettings: async () => ({ estimate_declared_value: 150 }),
}));

import {
  quoteResultShipping,
  RESULT_SHIPPING_UNAVAILABLE,
  resultParcelTypes,
  resultShippingAmount,
  sameQuoteDestination,
} from "@/lib/results/shipping";
import { estimateLines } from "@/lib/shipping/lines";
import type { ShippingMethod } from "@/lib/types/ecommerce";

const admin = {} as SupabaseClient;

function method(over: Partial<ShippingMethod> = {}): ShippingMethod {
  return {
    id: "m1",
    slug: "standard",
    content: {},
    base_rate: 8,
    free_above: null,
    currency: "SGD",
    countries: ["SG", "US"],
    is_active: true,
    position: 0,
    rate_source: "flat",
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("resultParcelTypes", () => {
  it("boxes a Result as its own product", () => {
    expect(resultParcelTypes({ id: "a", product_type: "pillow" })).toEqual(["pillow"]);
    expect(resultParcelTypes({ id: "a", product_type: "bolster", paired_build_id: null })).toEqual(["bolster"]);
  });

  it("ships a Paired build's Mbolster in its Mpillow's shipment", () => {
    expect(resultParcelTypes({ id: "a", product_type: "pillow", paired_build_id: "a" })).toEqual(["pillow", "bolster"]);
    expect(resultParcelTypes({ id: "b", product_type: "bolster", paired_build_id: "a" })).toEqual([]);
  });
});

describe("resultShippingAmount", () => {
  it("charges a flat method's base rate when no rate was quoted", () => {
    expect(resultShippingAmount(method(), null, 300)).toBe(8);
  });

  it("charges the rate quoted at hold, not the method's base rate", () => {
    const live = method({ rate_source: "easyship", base_rate: 0 });
    expect(resultShippingAmount(live, 42.5, 300)).toBe(42.5);
    expect(resultShippingAmount(live, "42.50", 300)).toBe(42.5);
  });

  it("still applies free_above to the goods, so a re-assigned tier can earn it", () => {
    const live = method({ rate_source: "easyship", free_above: 400 });
    expect(resultShippingAmount(live, 42.5, 399.99)).toBe(42.5);
    expect(resultShippingAmount(live, 42.5, 400)).toBe(0);
  });
});

describe("sameQuoteDestination", () => {
  it("compares country and postal code only, ignoring spacing and case", () => {
    expect(sameQuoteDestination({ country: "ca", postal_code: "v6b 1a1", city: "A" }, { country: "CA", postal_code: "V6B1A1", city: "B" })).toBe(true);
    expect(sameQuoteDestination({ country: "US", postal_code: "91606" }, { country: "US", postal_code: "91607" })).toBe(false);
    expect(sameQuoteDestination(null, { country: "US", postal_code: "91606" })).toBe(false);
  });
});

describe("quoteResultShipping", () => {
  beforeEach(() => h.quoteShippingMethods.mockReset());

  const destination = { country: "US", postal_code: "91606", city: "North Hollywood" };

  it("stores nothing for a flat method, and asks no courier", async () => {
    expect(await quoteResultShipping(admin, { method: method(), parcelTypes: ["pillow"], destination })).toEqual({ ok: true, rate: null });
    expect(h.quoteShippingMethods).not.toHaveBeenCalled();
  });

  it("asks no courier for a companion, which ships in its anchor's box", async () => {
    const live = method({ rate_source: "easyship" });
    expect(await quoteResultShipping(admin, { method: live, parcelTypes: [], destination })).toEqual({ ok: true, rate: null });
    expect(h.quoteShippingMethods).not.toHaveBeenCalled();
  });

  it("quotes a live method with the configurator's boxes, before free_above", async () => {
    const live = method({ rate_source: "easyship", free_above: 100 });
    h.quoteShippingMethods.mockResolvedValue({ options: [{ amount: 37.5 }], rates: null });
    const result = await quoteResultShipping(admin, { method: live, parcelTypes: ["pillow", "bolster"], destination });
    expect(result).toEqual({ ok: true, rate: 37.5 });
    const input = h.quoteShippingMethods.mock.calls[0][1];
    expect(input.methods).toEqual([live]);
    expect(input.subtotal).toBe(0);
    expect(input.lines).toEqual(estimateLines(["pillow", "bolster"], 150, "SGD"));
    expect(input.destination).toMatchObject({ country: "US", postal_code: "91606" });
  });

  it("refuses a live method no courier quotes for the address, never charging its base rate", async () => {
    h.quoteShippingMethods.mockResolvedValue({ options: [], rates: { ok: false, reason: "error", message: "down" } });
    const result = await quoteResultShipping(admin, {
      method: method({ rate_source: "easyship", base_rate: 8 }),
      parcelTypes: ["pillow"],
      destination,
    });
    expect(result).toEqual({ ok: false, error: RESULT_SHIPPING_UNAVAILABLE });
  });
});

describe("estimateLines", () => {
  it("is one unit of each type at the estimate value", () => {
    expect(estimateLines(["pillow", "bolster"], 150, "SGD")).toEqual([
      { product_type: "pillow", quantity: 1, weight_grams: null, unit_value: 150, currency: "SGD", description: "Mpillow" },
      { product_type: "bolster", quantity: 1, weight_grams: null, unit_value: 150, currency: "SGD", description: "Mbolster" },
    ]);
  });
});
