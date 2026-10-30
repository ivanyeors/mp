import { describe, expect, it } from "vitest";

import {
  compareFamilies,
  familyKey,
  familyTitle,
  isFamilyListed,
  resolveListingAction,
  SHOP_LISTABLE_ITEM_CATEGORIES,
  type ExistingVariant,
} from "@/lib/ecommerce/shop-listings";

const variant = (over: Partial<ExistingVariant> = {}): ExistingVariant => ({
  itemId: 1,
  variantActive: true,
  productId: "p1",
  productStatus: "active",
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
    // Prod's "Duo Face Cover" sits under bolster_case; appending would give
    // "Duo Face Cover Bolster Case".
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
    // Prod really has both `cotton` (S) and `Cotton` (L, M) under bolster_protector.
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

describe("isFamilyListed", () => {
  it("is false when nothing was ever published", () => {
    expect(isFamilyListed([])).toBe(false);
  });

  it("is false when the product is archived, even with active variants", () => {
    expect(isFamilyListed([variant({ productStatus: "draft" })])).toBe(false);
  });

  it("is false when the product is active but every variant is off", () => {
    expect(isFamilyListed([variant({ variantActive: false })])).toBe(false);
  });

  it("is true when the product is active and one variant is on", () => {
    expect(
      isFamilyListed([variant({ itemId: 1, variantActive: false }), variant({ itemId: 2 })]),
    ).toBe(true);
  });
});

describe("resolveListingAction", () => {
  it("publishes a family that has no storefront product yet", () => {
    expect(resolveListingAction([], true)).toBe("publish");
  });

  it("revives an archived product instead of publishing a duplicate", () => {
    const archived = [variant({ variantActive: false, productStatus: "draft" })];
    expect(resolveListingAction(archived, true)).toBe("activate");
  });

  it("deactivates a live family", () => {
    expect(resolveListingAction([variant()], false)).toBe("deactivate");
  });

  it("does nothing when the family is already in the desired state", () => {
    expect(resolveListingAction([variant()], true)).toBe("noop");
    expect(resolveListingAction([], false)).toBe("noop");
    expect(
      resolveListingAction([variant({ variantActive: false, productStatus: "draft" })], false),
    ).toBe("noop");
  });
});
