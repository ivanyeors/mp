import { describe, it, expect } from "vitest";
import { transitionResult } from "@/lib/result-lifecycle";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { assembleBuild, findStockShortages } from "@/lib/build-assembly";
import { priceResult } from "@/lib/result-pricing";

/** Slice 06 acceptance: assign requires template, filters by size, blocks on stock, prices final. */

describe("slice 06 assign path", () => {
  it("rejects assign without Filling Template", () => {
    const result = transitionResult(
      { status: "held", filling_template_id: null, payment_intent_id: "pi_1" },
      { action: "assign", filling_template_id: 0 },
    );
    expect(result.ok).toBe(false);
  });

  it("transitions held → assigned with template", () => {
    const result = transitionResult(
      { status: "held", filling_template_id: null, payment_intent_id: "pi_1" },
      { action: "assign", filling_template_id: 9 },
    );
    expect(result).toEqual({ ok: true, status: "assigned", releaseHold: false });
  });

  it("Filling Template picker only lists active templates for selected size", () => {
    const templates = [
      { id: 1, kind: "pillow", key: "M", role: "filling", is_active: true },
      { id: 2, kind: "pillow", key: "L", role: "filling", is_active: true },
      { id: 3, kind: "pillow", key: "M", role: "filling", is_active: false },
    ];
    expect(
      filterSelectableFillingTemplates(templates, { productType: "pillow", size: "M" }).map(
        (t) => t.id,
      ),
    ).toEqual([1]);
    // Override size L → only L templates
    expect(
      filterSelectableFillingTemplates(templates, { productType: "pillow", size: "L" }).map(
        (t) => t.id,
      ),
    ).toEqual([2]);
  });

  it("stock validation failure blocks assignment", () => {
    const assembled = assembleBuild({
      composedBomLines: [{ item_id: 1, quantity: 1, category: "packaging" }],
      fillingTemplateLines: [{ item_id: 2, quantity: 3, category: "filling" }],
      preferenceLines: [{ item_id: 3, quantity: 1, category: "cover" }],
      addonLines: [],
      costByItem: new Map(),
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    const shortages = findStockShortages(
      assembled.lines,
      new Map([
        [1, 10],
        [2, 1], // need 3
        [3, 1],
      ]),
      new Map([[2, "Fill"]]),
    );
    expect(shortages.length).toBe(1);
    expect(shortages[0].item_id).toBe(2);
  });

  it("final amount uses composed MSRP + prefs/add-ons + shipping + tax (fillings ignored)", () => {
    const priced = priceResult({
      composedSellableMsrp: 100,
      preferenceLines: [{ msrp: 20, quantity: 1 }],
      addonLines: [{ msrp: 10, quantity: 2 }],
      shipping: 5,
      tax: 3,
    });
    expect(priced.total).toBe(100 + 20 + 20 + 5 + 3);
  });
});
