// ponytail: widen this list if one of them ever needs to be sold.
export const SHOP_LISTABLE_ITEM_CATEGORIES = [
  "accessories",
  "cover",
  "pillow_case",
  "bolster_case",
  "pillow_protector",
  "bolster_protector",
] as const;

export const SHOP_CATEGORY_TITLES: Record<string, string> = {
  accessories: "Accessories",
  cover: "Covers",
  pillow_case: "Pillow cases",
  pillow_protector: "Pillow protectors",
  bolster_case: "Bolster cases",
  bolster_protector: "Bolster protectors",
};

export function isShopListableCategory(category: string): boolean {
  return (SHOP_LISTABLE_ITEM_CATEGORIES as readonly string[]).includes(category);
}

const CATEGORY_SUFFIX: Record<string, string> = {
  cover: "Cover",
  pillow_case: "Pillow Case",
  pillow_protector: "Pillow Protector",
  bolster_case: "Bolster Case",
  bolster_protector: "Bolster Protector",
  accessories: "",
};

const PRODUCT_NOUNS = ["cover", "case", "protector"];

export function familyTitle(category: string, name: string): string {
  const suffix = CATEGORY_SUFFIX[category] ?? "";
  if (!suffix) return name;
  const lower = name.toLowerCase();
  if (PRODUCT_NOUNS.some((noun) => lower.endsWith(noun))) return name;
  return `${name} ${suffix}`;
}

export function familyKey(category: string, name: string): string {
  return `${category}\u0000${name}`;
}

export function compareFamilies(
  a: { category: string; name: string },
  b: { category: string; name: string },
): number {
  const order = SHOP_LISTABLE_ITEM_CATEGORIES as readonly string[];
  return order.indexOf(a.category) - order.indexOf(b.category) || a.name.localeCompare(b.name);
}

const SIZE_ORDER = ["XS", "S", "M", "L", "XL"] as const;

/** ponytail: pillow size order for accessory families; extend SIZE_ORDER if new sizes appear */
export function sizeSortKey(size: string | null): number {
  if (!size) return 999;
  const i = (SIZE_ORDER as readonly string[]).indexOf(size.toUpperCase());
  return i === -1 ? 500 : i;
}

export function toCents(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const v = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export type CostingPrices = { costCents: number | null; msrpCents: number | null };
export type CostingField = "cost" | "msrp";

export function costingGaps(category: string, prices: CostingPrices, canSeeCost = true): CostingField[] {
  const gaps: CostingField[] = [];
  if (canSeeCost && prices.costCents == null) gaps.push("cost");
  if (isShopListableCategory(category) && prices.msrpCents == null) gaps.push("msrp");
  return gaps;
}

export function needsCosting(category: string, prices: CostingPrices, canSeeCost = true): boolean {
  return costingGaps(category, prices, canSeeCost).length > 0;
}

export function withoutCost<T extends CostingPrices>(prices: T): T {
  return { ...prices, costCents: null };
}

export function familiesWithoutCost(families: InventoryFamily[]): InventoryFamily[] {
  return families.map((f) => ({ ...f, sizes: f.sizes.map(withoutCost) }));
}

export function describeCostingGaps(gaps: CostingField[]): string {
  if (gaps.length === 2) return "a cost and an MSRP";
  return gaps[0] === "msrp" ? "an MSRP" : "a cost";
}

export function marginPct(costCents: number | null, msrpCents: number | null): number | null {
  if (costCents == null || msrpCents == null || msrpCents <= 0) return null;
  return Math.round(((msrpCents - costCents) / msrpCents) * 100);
}

export type FamilySize = {
  itemId: number;
  size: string | null;
  costCents: number | null;
  msrpCents: number | null;
  productId: string | null;
};

export type FamilyPushState = "new" | "partial" | "pushed";

export type InventoryFamily = {
  key: string;
  category: string;
  name: string;
  title: string;
  sizes: FamilySize[];
  push: FamilyPushState;
  productId: string | null;
  productSlug: string | null;
  productStatus: "draft" | "active" | "archived" | null;
};

export function familyPushState(sizes: Pick<FamilySize, "productId">[]): FamilyPushState {
  const onProduct = sizes.filter((s) => s.productId != null).length;
  if (onProduct === 0) return "new";
  return onProduct === sizes.length ? "pushed" : "partial";
}

export function sizesToPush<T extends Pick<FamilySize, "productId">>(sizes: T[]): T[] {
  return sizes.filter((s) => s.productId == null);
}

export function unsyncedSizes<T extends CostingPrices>(category: string, sizes: T[], canSeeCost = true): T[] {
  return sizes.filter((s) => needsCosting(category, s, canSeeCost));
}

export function mainProductId(sizes: Pick<FamilySize, "productId">[]): string | null {
  const counts = new Map<string, number>();
  for (const s of sizes) {
    if (s.productId) counts.set(s.productId, (counts.get(s.productId) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [id, count] of counts) {
    if (count > bestCount) {
      best = id;
      bestCount = count;
    }
  }
  return best;
}

export type ConfirmedPrice = { itemId: number; costCents: number | null; msrpCents: number };

export type PriceCheckFailure = {
  reason: "nothing_to_push" | "not_synced" | "no_msrp" | "changed";
  message: string;
};

function sizeLabel(size: string | null): string {
  return size ? `Size ${size}` : "This item";
}

export function checkPushPrices(
  category: string,
  toPush: FamilySize[],
  confirmed: ConfirmedPrice[],
  canSeeCost = true,
): PriceCheckFailure | null {
  if (toPush.length === 0) {
    return { reason: "nothing_to_push", message: "Every size is already in Products." };
  }
  for (const size of toPush) {
    const gaps = costingGaps(category, size);
    if (gaps.length > 0) {
      return {
        reason: "not_synced",
        message: `${sizeLabel(size.size)} needs ${describeCostingGaps(gaps)} in Costings first.`,
      };
    }
    if ((size.msrpCents ?? 0) <= 0) {
      return { reason: "no_msrp", message: `${sizeLabel(size.size)} needs an MSRP above $0.00.` };
    }
  }
  const byItem = new Map(confirmed.map((c) => [c.itemId, c]));
  const changed = toPush.some((size) => {
    const seen = byItem.get(size.itemId);
    return !seen || (canSeeCost && seen.costCents !== size.costCents) || seen.msrpCents !== size.msrpCents;
  });
  if (changed) {
    return {
      reason: "changed",
      message: "Prices changed in Costings since you checked them. Check them again.",
    };
  }
  return null;
}

export type ShopProductListing = {
  id: string;
  slug: string;
  title: string;
  productType: string;
  status: "draft" | "active";
  isAutoGenerated: boolean;
  listed: boolean;
  categoryName: string | null;
  thumbnailUrl: string | null;
  variantCount: number;
  priceMinCents: number | null;
  priceMaxCents: number | null;
  blocker: string | null;
};

type ListableVariant = { price: number | string | null; is_active: boolean };

export function listingBlocker(product: {
  isAutoGenerated: boolean;
  variants: ListableVariant[];
}): string | null {
  if (product.variants.length === 0) return "It has no variants to sell.";
  const active = product.variants.filter((v) => v.is_active);
  const selling = active.length > 0 ? active : product.variants;
  const unpriced = selling.some((v) => (toCents(v.price) ?? 0) <= 0);
  if (!unpriced) return null;
  return product.isAutoGenerated
    ? "Set an MSRP in Costings for every size first."
    : "Set a price on every variant first.";
}

export function costingsHrefFor(itemIds: number[]): string {
  return `/settings/costings?items=${[...new Set(itemIds)].join(",")}`;
}

export function parseCostingsItems(search: string): number[] {
  const raw = new URLSearchParams(search).get("items");
  if (!raw) return [];
  return [
    ...new Set(
      raw
        .split(",")
        .map((part) => Number.parseInt(part.trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0),
    ),
  ];
}
