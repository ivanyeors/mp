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
    // Was [10, 11]. The shopper chose a cover, so the BOM's default cover (10) is
    // displaced rather than shipped alongside it; the protector (11) fills no
    // preference role and survives.
    expect(assembled.lines.filter((l) => l.role === "composed").map((l) => l.item_id)).toEqual([
      11,
    ]);
    expect(assembled.lines.filter((l) => l.role === "filling")).toEqual([
      { item_id: 20, quantity: 3, role: "filling", category: "filling" },
    ]);
    expect(assembled.lines.some((l) => l.item_id === 99)).toBe(false);
  });

  it("prices a hold from the goods subtotal plus shipping and tax", () => {
    const priced = priceResult({ subtotal: 140, shipping: 8, tax: 12 });
    expect(priced.subtotal).toBe(140);
    expect(priced.total).toBe(160);
  });
});

/**
 * Two Costings MSRPs for one size x tier used to surface to the shopper as
 * "This configuration isn't available for purchase yet" — an absence, when the truth
 * was an ambiguity.
 *
 * That has since been narrowed, and the narrowing is a deliberate REVERSAL: premium
 * is PRICED per case fabric family, so `…:linen` + `…:fibrecool` is the correct,
 * expected shape and must resolve. Only two rows for the SAME family are ambiguous.
 * Do not "restore" the old rule — the nine premium price points do not decompose into
 * one base (see 20260913000000_premium_variant_prices.sql).
 */
describe("loadComposedSellable — one row per case fabric family", () => {
  /** Chainable Supabase stub: every builder method returns itself, await yields data. */
  function table(data: unknown) {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    Object.assign(chain, {
      select: self,
      eq: self,
      in: self,
      not: self,
      maybeSingle: async () => ({
        data: Array.isArray(data) ? ((data as unknown[])[0] ?? null) : data,
        error: null,
      }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res),
    });
    return chain;
  }

  /** Premium M: BOM ships the Fibrecool case (item 53, MSRP 104). */
  const FIBRECOOL_M = { id: 53, category: "pillow_case", price_family: "fibrecool", size: "M" };
  const LINEN_M = { id: 44, category: "pillow_case", price_family: "linen", size: "M" };

  function stub(
    priceRows: Array<{ key: string; variant?: string | null; msrp: number | null; currency?: string }>,
    opts: { bomCaseId?: number } = {},
  ) {
    const bomCaseId = opts.bomCaseId ?? 53;
    return {
      from(t: string) {
        if (t === "pillow_products") return table({ id: 8 });
        if (t === "bom_lines") return table([{ item_id: bomCaseId, quantity: 1 }]);
        if (t === "product_prices") return table(priceRows);
        if (t === "items") return table([FIBRECOOL_M, LINEN_M]);
        if (t === "item_prices")
          return table([
            { item_id: 53, msrp: 104 },
            { item_id: 44, msrp: 75 },
          ]);
        return table([]);
      },
    } as never;
  }

  const key = { productType: "pillow", size: "M", tier: "premium" } as const;
  const load = async () =>
    (await import("@/lib/results/composed-sellable")).loadComposedSellable;

  it("resolves both family rows and shelf-prices the BOM's own default", async () => {
    const res = await (await load())(
      stub([
        { key: "product:pillow:8:linen", variant: "linen", msrp: 430 },
        { key: "product:pillow:8:fibrecool", variant: "fibrecool", msrp: 460 },
      ]),
      key,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      // Ships Fibrecool, so the shelf price is 460 — not 430, and not whichever row
      // the query returned last.
      expect(res.sellable.msrp).toBe(460);
      expect(res.sellable.msrpByFamily).toEqual({ linen: 430, fibrecool: 460 });
    }
  });

  it("shelf-prices the linen row when the BOM ships linen", async () => {
    const res = await (await load())(
      stub(
        [
          { key: "product:pillow:8:linen", variant: "linen", msrp: 430 },
          { key: "product:pillow:8:fibrecool", variant: "fibrecool", msrp: 460 },
        ],
        { bomCaseId: 44 },
      ),
      key,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sellable.msrp).toBe(430);
  });

  it("two rows for the SAME family are still ambiguous, and name both keys", async () => {
    const res = await (await load())(
      stub([
        { key: "product:pillow:8:linen", variant: "linen", msrp: 430 },
        { key: "product:pillow:8:linen-old", variant: "linen", msrp: 420 },
      ]),
      key,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("ambiguous_price");
      expect(res.error).toContain("product:pillow:8:linen");
      expect(res.error).toContain("product:pillow:8:linen-old");
    }
  });

  it("still reports a genuine absence as no_price", async () => {
    const res = await (await load())(stub([{ key: "product:pillow:8", msrp: null }]), key);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("no_price");
  });

  it("resolves a single unkeyed row — basic's shape", async () => {
    const res = await (await load())(
      stub([{ key: "product:pillow:8", variant: null, msrp: 460, currency: "SGD" }]),
      key,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.sellable.msrp).toBe(460);
  });

  it("refuses when the BOM's case family has no row at all", async () => {
    const res = await (await load())(
      stub([{ key: "product:pillow:8:linen", variant: "linen", msrp: 430 }]),
      key,
    );
    // BOM ships Fibrecool; only a linen row exists and there is no unkeyed fallback.
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe("no_price");
  });
});
