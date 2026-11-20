import { describe, expect, it } from "vitest";

import {
  checkPushPrices,
  compareFamilies,
  costingGaps,
  costingsHrefFor,
  familyKey,
  familyPushState,
  familyTitle,
  listingBlocker,
  mainProductId,
  marginPct,
  parseCostingsItems,
  SHOP_LISTABLE_ITEM_CATEGORIES,
  sizesToPush,
  toCents,
  type FamilySize,
} from "@/lib/ecommerce/inventory-families";

const size = (over: Partial<FamilySize> = {}): FamilySize => ({
  itemId: 1,
  size: "M",
  costCents: 1000,
  msrpCents: 3800,
  productId: null,
  ...over,
});

describe("familyTitle", () => {
  it("leaves accessories alone — they are already named as products", () => {
    expect(familyTitle("accessories", "Ear Comfort Pad")).toBe("Ear Comfort Pad");
  });

  it("names the part, because inventory names mean nothing to a shopper", () => {
    expect(familyTitle("bolster_case", "Camel")).toBe("Camel Bolster Case");
    expect(familyTitle("pillow_case", "Fibrecool")).toBe("Fibrecool Pillow Case");
    expect(familyTitle("cover", "Satin White")).toBe("Satin White Cover");
  });

  it("does not stutter when the name already reads as a product", () => {
    expect(familyTitle("bolster_case", "Duo Face Cover")).toBe("Duo Face Cover");
    expect(familyTitle("cover", "Satin White Cover")).toBe("Satin White Cover");
  });

  it("still names the part when the name is only a colour or fabric", () => {
    expect(familyTitle("pillow_protector", "Waterproof Inner")).toBe(
      "Waterproof Inner Pillow Protector",
    );
    expect(familyTitle("bolster_protector", "Cotton")).toBe("Cotton Bolster Protector");
  });
});

describe("familyKey", () => {
  it("separates same-named items in different categories", () => {
    expect(familyKey("cover", "Cotton")).not.toBe(familyKey("bolster_protector", "Cotton"));
  });

  it("keeps a casing typo visible rather than silently merging it", () => {
    expect(familyKey("bolster_protector", "cotton")).not.toBe(
      familyKey("bolster_protector", "Cotton"),
    );
  });
});

describe("SHOP_LISTABLE_ITEM_CATEGORIES", () => {
  it("excludes build inputs that are never sold on their own", () => {
    for (const category of ["filling", "packaging", "other"]) {
      expect(SHOP_LISTABLE_ITEM_CATEGORIES).not.toContain(category);
    }
  });
});

describe("compareFamilies", () => {
  it("groups by category in declared order, not alphabetically", () => {
    const families = [
      { category: "bolster_protector", name: "Cotton" },
      { category: "pillow_case", name: "Fibrecool" },
      { category: "cover", name: "Satin White" },
      { category: "bolster_case", name: "Camel" },
      { category: "accessories", name: "Slope Mattress" },
      { category: "accessories", name: "Ear Comfort Pad" },
      { category: "pillow_protector", name: "Waterproof Inner" },
    ];
    expect([...families].sort(compareFamilies).map((f) => `${f.category}/${f.name}`)).toEqual([
      "accessories/Ear Comfort Pad",
      "accessories/Slope Mattress",
      "cover/Satin White",
      "pillow_case/Fibrecool",
      "bolster_case/Camel",
      "pillow_protector/Waterproof Inner",
      "bolster_protector/Cotton",
    ]);
  });
});

describe("toCents", () => {
  it("reads Costings numerics, which come back as strings", () => {
    expect(toCents("38.00")).toBe(3800);
    expect(toCents(12.345)).toBe(1235);
    expect(toCents(null)).toBeNull();
    expect(toCents("")).toBeNull();
    expect(toCents("abc")).toBeNull();
  });
});

describe("costingGaps", () => {
  it("asks a sold item for both a cost and an MSRP", () => {
    expect(costingGaps("cover", { costCents: null, msrpCents: null })).toEqual(["cost", "msrp"]);
    expect(costingGaps("accessories", { costCents: 500, msrpCents: null })).toEqual(["msrp"]);
    expect(costingGaps("pillow_case", { costCents: null, msrpCents: 3800 })).toEqual(["cost"]);
  });

  it("asks a build input only for a cost, since it is never sold on its own", () => {
    expect(costingGaps("filling", { costCents: null, msrpCents: null })).toEqual(["cost"]);
    expect(costingGaps("packaging", { costCents: 20, msrpCents: null })).toEqual([]);
  });

  it("is satisfied by a zero cost, which is a price, not a gap", () => {
    expect(costingGaps("cover", { costCents: 0, msrpCents: 3800 })).toEqual([]);
  });
});

describe("marginPct", () => {
  it("is the share of the MSRP kept", () => {
    expect(marginPct(1000, 4000)).toBe(75);
    expect(marginPct(5000, 4000)).toBe(-25);
  });

  it("has no answer without both prices", () => {
    expect(marginPct(null, 4000)).toBeNull();
    expect(marginPct(1000, null)).toBeNull();
    expect(marginPct(1000, 0)).toBeNull();
  });
});

describe("familyPushState", () => {
  it("is new when no size sells as a product", () => {
    expect(familyPushState([size(), size({ itemId: 2 })])).toBe("new");
  });

  it("is partial when a size joined Inventory after the push", () => {
    expect(familyPushState([size({ productId: "p1" }), size({ itemId: 2 })])).toBe("partial");
  });

  it("is pushed when every size is a Variant", () => {
    expect(familyPushState([size({ productId: "p1" })])).toBe("pushed");
  });
});

describe("sizesToPush", () => {
  it("is the sizes no product sells yet", () => {
    const sizes = [size({ itemId: 1, productId: "p1" }), size({ itemId: 2 })];
    expect(sizesToPush(sizes).map((s) => s.itemId)).toEqual([2]);
  });
});

describe("mainProductId", () => {
  it("is the product most sizes sell as, so a stray size never redirects the family", () => {
    const sizes = [
      size({ itemId: 1, productId: "stray" }),
      size({ itemId: 2, productId: "main" }),
      size({ itemId: 3, productId: "main" }),
      size({ itemId: 4 }),
    ];
    expect(mainProductId(sizes)).toBe("main");
    expect(mainProductId([size()])).toBeNull();
  });
});

describe("checkPushPrices", () => {
  const confirmed = (s: FamilySize) => ({ itemId: s.itemId, costCents: s.costCents!, msrpCents: s.msrpCents! });

  it("passes when the operator confirmed exactly what Costings holds", () => {
    const s = size();
    expect(checkPushPrices("cover", [s], [confirmed(s)])).toBeNull();
  });

  it("refuses a size Costings has not finished", () => {
    const s = size({ size: "L", costCents: null });
    expect(checkPushPrices("cover", [s], [])).toEqual({
      reason: "not_synced",
      message: "Size L needs a cost in Costings first.",
    });
  });

  it("refuses an MSRP of zero, which would sell it free", () => {
    const s = size({ msrpCents: 0 });
    expect(checkPushPrices("cover", [s], [confirmed(s)])?.reason).toBe("no_msrp");
  });

  it("refuses when Costings changed after the dialog opened", () => {
    const s = size();
    expect(checkPushPrices("cover", [s], [{ ...confirmed(s), msrpCents: 3000 }])?.reason).toBe("changed");
    expect(checkPushPrices("cover", [s, size({ itemId: 2 })], [confirmed(s)])?.reason).toBe("changed");
  });

  it("has nothing to push when every size is already a product", () => {
    expect(checkPushPrices("cover", [], [])?.reason).toBe("nothing_to_push");
  });

  it("allows a price below cost: that is the operator's call, shown in the dialog", () => {
    const s = size({ costCents: 5000, msrpCents: 3800 });
    expect(checkPushPrices("cover", [s], [confirmed(s)])).toBeNull();
  });
});

describe("listingBlocker", () => {
  it("lets a product with every sold Variant priced go in the shop", () => {
    expect(
      listingBlocker({ isAutoGenerated: true, variants: [{ price: "38.00", is_active: true }] }),
    ).toBeNull();
  });

  it("ignores a Variant that is switched off", () => {
    expect(
      listingBlocker({
        isAutoGenerated: true,
        variants: [
          { price: "38.00", is_active: true },
          { price: 0, is_active: false },
        ],
      }),
    ).toBeNull();
  });

  it("checks every Variant when all are off, since listing turns them back on", () => {
    expect(
      listingBlocker({
        isAutoGenerated: true,
        variants: [
          { price: "38.00", is_active: false },
          { price: 0, is_active: false },
        ],
      }),
    ).toBe("Set an MSRP in Costings for every size first.");
  });

  it("points a hand-made product at its own price, not Costings", () => {
    expect(listingBlocker({ isAutoGenerated: false, variants: [{ price: null, is_active: true }] })).toBe(
      "Set a price on every variant first.",
    );
    expect(listingBlocker({ isAutoGenerated: false, variants: [] })).toBe("It has no variants to sell.");
  });
});

describe("costingsHrefFor / parseCostingsItems", () => {
  it("round-trips the item ids, once each", () => {
    const href = costingsHrefFor([12, 13, 12]);
    expect(href).toBe("/settings/costings?items=12,13");
    expect(parseCostingsItems(href.slice(href.indexOf("?")))).toEqual([12, 13]);
  });

  it("drops anything that is not an item id", () => {
    expect(parseCostingsItems("?items=4,abc,-2,0,5")).toEqual([4, 5]);
    expect(parseCostingsItems("?tab=parts")).toEqual([]);
  });
});
