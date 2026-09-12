import { describe, it, expect } from "vitest";
import { BOLSTER_LENGTHS, isBolsterLength } from "@/lib/results/composed-sellable";
import { filterSelectableFillingTemplates } from "@/lib/filling-templates";
import { assembleBuild } from "@/lib/build-assembly";
import { priceResult } from "@/lib/result-pricing";

describe("slice 09 — mbolster composed sellable", () => {
  it("accepts only short/medium/long lengths", () => {
    expect(BOLSTER_LENGTHS).toEqual(["short", "medium", "long"]);
    expect(isBolsterLength("medium")).toBe(true);
    expect(isBolsterLength("M")).toBe(false);
    expect(isBolsterLength("basic")).toBe(false);
  });

  it("filters Filling Templates by bolster + length key", () => {
    const templates = [
      { id: 1, kind: "bolster", key: "medium", role: "filling", is_active: true },
      { id: 2, kind: "bolster", key: "short", role: "filling", is_active: true },
      { id: 3, kind: "pillow", key: "M", role: "filling", is_active: true },
      { id: 4, kind: "bolster", key: "medium", role: "base", is_active: true },
    ];
    const selectable = filterSelectableFillingTemplates(templates, {
      productType: "bolster",
      size: "medium",
    });
    expect(selectable.map((t) => t.id)).toEqual([1]);
  });

  it("assembles bolster build from length BOM + filling template + prefs (no customer fillings)", () => {
    const assembled = assembleBuild({
      composedBomLines: [
        { item_id: 10, quantity: 1, category: "cover" },
        { item_id: 11, quantity: 1, category: "bolster_protector" },
        { item_id: 99, quantity: 2, category: "filling" }, // ignored — template owns fillings
      ],
      fillingTemplateLines: [{ item_id: 20, quantity: 3, category: "filling" }],
      preferenceLines: [
        { item_id: 30, quantity: 1, category: "cover" },
        { item_id: 31, quantity: 1, category: "case" },
      ],
      addonLines: [{ item_id: 40, quantity: 1 }],
      costByItem: new Map([
        [10, 5],
        [11, 4],
        [20, 2],
        [30, 8],
        [31, 6],
        [40, 10],
      ]),
    });
    expect(assembled.ok).toBe(true);
    if (!assembled.ok) return;
    expect(assembled.lines.filter((l) => l.role === "composed").map((l) => l.item_id)).toEqual([
      10, 11,
    ]);
    expect(assembled.lines.filter((l) => l.role === "filling")).toEqual([
      { item_id: 20, quantity: 3, role: "filling", category: "filling" },
    ]);
    expect(assembled.lines.some((l) => l.item_id === 99)).toBe(false);
  });

  it("prices hold from length MSRP + prefs/add-ons + shipping + tax", () => {
    const priced = priceResult({
      composedSellableMsrp: 100,
      preferenceLines: [{ msrp: 20, quantity: 1 }],
      addonLines: [{ msrp: 10, quantity: 2 }],
      shipping: 8,
      tax: 12,
    });
    expect(priced.subtotal).toBe(140);
    expect(priced.total).toBe(160);
  });
});

/**
 * Two Costings MSRPs for one size×tier used to surface to the shopper as
 * "This configuration isn't available for purchase yet" — an absence, when the
 * truth was an ambiguity. Costings writes premium as `…:linen` / `…:fibrecool`
 * while the lookup filters by product_id alone, so `.maybeSingle()` errored and
 * the null read as "no price".
 */
describe("loadComposedSellable — ambiguous vs absent price", () => {
  /** Minimal chainable Supabase stub: only the two tables this function reads. */
  function stub(priceRows: Array<{ key: string; msrp: number | null; currency?: string }>) {
    return {
      from(table: string) {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        Object.assign(chain, {
          select: self,
          eq: self,
          maybeSingle: async () =>
            table === "pillow_products" ? { data: { id: 8 } } : { data: null },
          then: undefined,
        });
        if (table === "bom_lines") {
          return Object.assign(chain, {
            select: () => ({ eq: async () => ({ data: [], error: null }) }),
          });
        }
        if (table === "product_prices") {
          return Object.assign(chain, {
            select: () => ({
              eq: () => ({ eq: async () => ({ data: priceRows, error: null }) }),
            }),
          });
        }
        return chain;
      },
    } as never;
  }

  const key = { productType: "pillow", size: "M", tier: "premium" } as const;

  it("names both keys instead of claiming there is no price", async () => {
    const { loadComposedSellable } = await import("@/lib/results/composed-sellable");
    const res = await loadComposedSellable(
      stub([
        { key: "product:pillow:8:linen", msrp: 430 },
        { key: "product:pillow:8:fibrecool", msrp: 460 },
      ]),
      key,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("ambiguous_price");
      expect(res.error).toContain("product:pillow:8:linen");
      expect(res.error).toContain("product:pillow:8:fibrecool");
    }
  });

  it("still reports a genuine absence as no_price", async () => {
    const { loadComposedSellable } = await import("@/lib/results/composed-sellable");
    const res = await loadComposedSellable(stub([{ key: "product:pillow:8", msrp: null }]), key);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("no_price");
  });

  it("resolves the single expected price", async () => {
    const { loadComposedSellable } = await import("@/lib/results/composed-sellable");
    const res = await loadComposedSellable(
      stub([{ key: "product:pillow:8", msrp: 460, currency: "SGD" }]),
      key,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sellable.msrp).toBe(460);
  });
});
