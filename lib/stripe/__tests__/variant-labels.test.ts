import { describe, expect, it } from "vitest";
import { loadVariantLabels, withPricingBlock } from "@/lib/stripe/variant-labels";

/** Chainable Supabase stub: builder methods return self, await yields data. */
function table(data: unknown) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    select: self,
    eq: self,
    in: self,
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res),
  });
  return chain;
}

/** Prod shapes: premium XS ships Fibrecool (360), premium S ships linen (400). */
const admin = {
  from(t: string) {
    if (t === "pillow_products")
      return table([
        { id: 6, size: "XS", kind: "premium" },
        { id: 7, size: "S", kind: "premium" },
      ]);
    if (t === "bom_lines")
      return table([
        { product_id: 7, item_id: 43 },
        { product_id: 6, item_id: 32 },
        { product_id: 6, item_id: 1 }, // the cover — must not be mistaken for a case
      ]);
    if (t === "items")
      return table([
        { id: 32, name: "Fibrecool", category: "pillow_case", price_family: "fibrecool" },
        { id: 43, name: "Deep Blue Linen", category: "pillow_case", price_family: "linen" },
      ]);
    return table([]);
  },
} as never;

const XS = { id: "v-xs", title: "Size XS", price: 360, currency: "SGD", pillow_product_id: 6 };
const S = { id: "v-s", title: "Size S", price: 400, currency: "SGD", pillow_product_id: 7 };

describe("loadVariantLabels", () => {
  it("says which fabric a size's price is for", async () => {
    // "Size XS 360" next to "Size S 400" reads as arbitrary until the fabric is
    // named: XS ships Fibrecool and S ships linen, which IS the difference.
    const labels = await loadVariantLabels(admin, [XS, S]);
    expect(labels.get("v-xs")?.nickname).toBe("Premium XS · Fibrecool case");
    expect(labels.get("v-s")?.nickname).toBe("Premium S · Linen case");
  });

  it("carries the fabric and the case item into Price metadata", async () => {
    const labels = await loadVariantLabels(admin, [XS]);
    expect(labels.get("v-xs")?.metadata).toMatchObject({
      size: "XS",
      tier: "premium",
      case_fabric: "fibrecool",
      case_item: "Fibrecool",
      includes: "pillow + cover + case",
    });
  });

  it("does not mistake the BOM's cover for its case", async () => {
    const labels = await loadVariantLabels(admin, [XS]);
    expect(labels.get("v-xs")?.metadata.case_item).toBe("Fibrecool");
  });

  it("omits the fabric rather than guessing when a case has no family", async () => {
    const unfamilied = {
      from(t: string) {
        if (t === "pillow_products") return table([{ id: 10, size: "XL", kind: "premium" }]);
        if (t === "bom_lines") return table([{ product_id: 10, item_id: 99 }]);
        if (t === "items")
          return table([{ id: 99, name: "Mystery", category: "pillow_case", price_family: null }]);
        return table([]);
      },
    } as never;
    const labels = await loadVariantLabels(unfamilied, [
      { id: "v-xl", title: "Size XL", price: 680, currency: "SGD", pillow_product_id: 10 },
    ]);
    // An unfamilied case cannot be priced either, so a confident label would claim
    // more than the pricing side is willing to.
    expect(labels.get("v-xl")?.nickname).toBe("Premium XL");
    expect(labels.get("v-xl")?.metadata.case_fabric).toBeUndefined();
  });

  it("orders the description block XS to XL, not alphabetically", async () => {
    const labels = await loadVariantLabels(admin, [S, XS]);
    const block = withPricingBlock("", [labels.get("v-s")!, labels.get("v-xs")!]);
    expect(block.indexOf("XS —")).toBeLessThan(block.indexOf("S — Linen"));
  });

  it("falls back to the variant title for a non-pillow product", async () => {
    const labels = await loadVariantLabels(admin, [
      { id: "v-acc", title: "Medium", price: 38, currency: "SGD", pillow_product_id: null },
    ]);
    expect(labels.get("v-acc")?.nickname).toBe("Medium");
  });
});

describe("withPricingBlock", () => {
  const d = (line: string, sortKey = 0) => ({ nickname: "", metadata: {}, line, sortKey, derived: true });
  const lines = [
    d("XS — Fibrecool (Fibrecool) — SGD 360.00", 0),
    d("S — Linen (Deep Blue Linen) — SGD 400.00", 1),
  ];

  it("keeps the admin's own copy", () => {
    const out = withPricingBlock("Custom-fit premium pillow.", lines);
    expect(out.startsWith("Custom-fit premium pillow.")).toBe(true);
    expect(out).toContain("SGD 360.00");
  });

  it("is idempotent — a re-sync replaces the block, never stacks copies", () => {
    const once = withPricingBlock("Custom-fit premium pillow.", lines);
    const twice = withPricingBlock(once, lines);
    expect(twice).toBe(once);
  });

  it("replaces a stale block rather than appending beside it", () => {
    const stale = withPricingBlock("Desc.", [d("XL — Linen — SGD 1000.00")]);
    const fresh = withPricingBlock(stale, [d("XL — Linen — SGD 680.00")]);
    expect(fresh).toContain("680.00");
    expect(fresh).not.toContain("1000.00");
  });

  it("returns the description untouched when there is nothing to say", () => {
    expect(withPricingBlock("Just a description.", [])).toBe("Just a description.");
  });

  it("adds nothing for a single-variant accessory", () => {
    // "Slope Mattress — 120.00" under a sentence about covers and cases is noise,
    // and the sentence is false for a mattress topper.
    const accessory = [
      { nickname: "Default", metadata: {}, line: "Default — SGD 120.00", sortKey: 5, derived: false },
    ];
    expect(withPricingBlock("A slope mattress.", accessory)).toBe("A slope mattress.");
  });

  it("strips a stale block even when no new one qualifies", () => {
    const stale = withPricingBlock("Desc.", [d("XL — Linen — SGD 680.00")]);
    expect(withPricingBlock(stale, [])).toBe("Desc.");
  });
});
