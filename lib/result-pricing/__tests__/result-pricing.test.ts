import { describe, it, expect } from "vitest";
import { priceResult } from "@/lib/result-pricing";

describe("priceResult", () => {
  it("matches Costings: composed MSRP + preference/add-on MSRPs", () => {
    const priced = priceResult({
      composedSellableMsrp: 100,
      preferenceLines: [
        { msrp: 20, quantity: 1 },
        { msrp: 15, quantity: 1 },
      ],
      addonLines: [{ msrp: 10, quantity: 2 }],
    });
    expect(priced.subtotal).toBe(100 + 20 + 15 + 20);
    expect(priced.shipping).toBe(0);
    expect(priced.tax).toBe(0);
    expect(priced.total).toBe(155);
  });

  it("includes shipping and tax when provided", () => {
    const priced = priceResult({
      composedSellableMsrp: 100,
      preferenceLines: [],
      addonLines: [],
      shipping: 8,
      tax: 0,
    });
    expect(priced.total).toBe(108);
    expect(priced.shipping).toBe(8);
    expect(priced.tax).toBe(0);
  });

  it("filling lines do not alter sell total (not in input surface)", () => {
    // Callers must not pass fillings; same prefs/composed yield same total regardless of COGS.
    const a = priceResult({
      composedSellableMsrp: 50,
      preferenceLines: [{ msrp: 5, quantity: 1 }],
      addonLines: [],
      shipping: 3,
      tax: 1,
    });
    const b = priceResult({
      composedSellableMsrp: 50,
      preferenceLines: [{ msrp: 5, quantity: 1 }],
      addonLines: [],
      shipping: 3,
      tax: 1,
    });
    expect(a.total).toBe(59);
    expect(a).toEqual(b);
  });
});
