/**
 * How an inventory Item becomes a Storefront product, as pure functions that
 * both the server and the Admin Panel pages use.
 *
 * The path is Inventory → Costings → Products → In the shop:
 *
 * 1. An Item is added in Inventory.
 * 2. Costings gives it a cost and an MSRP. Until it has both it is not synced,
 *    and the Inventory page shows a button that goes to Costings.
 * 3. Staff push it to Products after a price check: they see each size's cost,
 *    MSRP and margin, and confirm them. The push makes a draft Storefront
 *    product, or adds the new sizes to the product the family already has.
 * 4. Settings → Products → In the shop switches that product on. It lists
 *    Storefront products only, so nothing reaches the shop that is not on the
 *    Products page.
 *
 * Nothing here touches the database, so this file is safe in client components.
 */

/**
 * Inventory categories a shopper can buy on its own. Fillings, packaging and
 * `other` are deliberately absent: they are build inputs, not products.
 * ponytail: widen this list if one of them ever needs to be sold.
 */
export const SHOP_LISTABLE_ITEM_CATEGORIES = [
  "accessories",
  "cover",
  "pillow_case",
  "bolster_case",
  "pillow_protector",
  "bolster_protector",
] as const;

/** Plural headings for the sellable categories, as the Products page groups them. */
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

/**
 * Singular, because these become product titles. An item named "Camel" or
 * "Fibrecool" says nothing to a shopper; "Camel Bolster Case" does. Accessories
 * are already named as products ("Ear Comfort Pad"), so they take no suffix.
 */
const CATEGORY_SUFFIX: Record<string, string> = {
  cover: "Cover",
  pillow_case: "Pillow Case",
  pillow_protector: "Pillow Protector",
  bolster_case: "Bolster Case",
  bolster_protector: "Bolster Protector",
  accessories: "",
};

/** A name ending in one of these already reads as a product. */
const PRODUCT_NOUNS = ["cover", "case", "protector"];

export function familyTitle(category: string, name: string): string {
  const suffix = CATEGORY_SUFFIX[category] ?? "";
  if (!suffix) return name;
  // "Duo Face Cover" is a bolster case, but naming it one reads as a stutter.
  const lower = name.toLowerCase();
  if (PRODUCT_NOUNS.some((noun) => lower.endsWith(noun))) return name;
  return `${name} ${suffix}`;
}

/**
 * Items group into one Storefront product per (category, name); sizes become
 * Variants. The NUL separator cannot appear in either part, so two families
 * never share a key.
 */
export function familyKey(category: string, name: string): string {
  return `${category}\u0000${name}`;
}

/** Categories in the order they are declared (accessories, covers, cases, protectors), then by name. */
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

/** A Costings money value (`numeric` comes back as a string) in cents, or null. */
export function toCents(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const v = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export type CostingPrices = { costCents: number | null; msrpCents: number | null };
export type CostingField = "cost" | "msrp";

/**
 * What an Item still needs in Costings before Inventory and Costings are in
 * step. An Item sold in the shop needs a cost (for margin) and an MSRP (what
 * shoppers pay). A build input (filling, packaging, other) is never sold on its
 * own, so it needs only a cost, which every build that uses it adds up.
 */
export function costingGaps(category: string, prices: CostingPrices): CostingField[] {
  const gaps: CostingField[] = [];
  if (prices.costCents == null) gaps.push("cost");
  if (isShopListableCategory(category) && prices.msrpCents == null) gaps.push("msrp");
  return gaps;
}

export function needsCosting(category: string, prices: CostingPrices): boolean {
  return costingGaps(category, prices).length > 0;
}

/** "a cost", "an MSRP" or "a cost and an MSRP": what to ask for. */
export function describeCostingGaps(gaps: CostingField[]): string {
  if (gaps.length === 2) return "a cost and an MSRP";
  return gaps[0] === "msrp" ? "an MSRP" : "a cost";
}

/** Margin as a share of the MSRP, in whole percent. Null without both prices or with no MSRP. */
export function marginPct(costCents: number | null, msrpCents: number | null): number | null {
  if (costCents == null || msrpCents == null || msrpCents <= 0) return null;
  return Math.round(((msrpCents - costCents) / msrpCents) * 100);
}

/** One size of an inventory family, with its Costings prices and the product it sells as. */
export type FamilySize = {
  itemId: number;
  size: string | null;
  costCents: number | null;
  msrpCents: number | null;
  /** The Storefront product this size is a Variant of, if it has been pushed. */
  productId: string | null;
};

/**
 * `new`: no Storefront product yet. `partial`: a product exists but lacks some
 * sizes (a size added to Inventory after the push). `pushed`: every size is on it.
 */
export type FamilyPushState = "new" | "partial" | "pushed";

export type InventoryFamily = {
  key: string;
  category: string;
  name: string;
  title: string;
  sizes: FamilySize[];
  push: FamilyPushState;
  /** The product the family sells as (the one holding most of its sizes). */
  productId: string | null;
  productSlug: string | null;
  productStatus: "draft" | "active" | "archived" | null;
};

export function familyPushState(sizes: Pick<FamilySize, "productId">[]): FamilyPushState {
  const onProduct = sizes.filter((s) => s.productId != null).length;
  if (onProduct === 0) return "new";
  return onProduct === sizes.length ? "pushed" : "partial";
}

/** The sizes a push would add: the ones no product sells yet. */
export function sizesToPush<T extends Pick<FamilySize, "productId">>(sizes: T[]): T[] {
  return sizes.filter((s) => s.productId == null);
}

/** Sizes Costings has not finished: they hold the push back. */
export function unsyncedSizes<T extends CostingPrices>(category: string, sizes: T[]): T[] {
  return sizes.filter((s) => needsCosting(category, s));
}

/** The product most of a family's sizes sell as, so a stray size never redirects the family. */
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

/** The prices an operator saw and confirmed in the push dialog. */
export type ConfirmedPrice = { itemId: number; costCents: number; msrpCents: number };

export type PriceCheckFailure = {
  reason: "nothing_to_push" | "not_synced" | "no_msrp" | "changed";
  message: string;
};

function sizeLabel(size: string | null): string {
  return size ? `Size ${size}` : "This item";
}

/**
 * The price check a push must pass. Every size being pushed has a cost and an
 * MSRP above zero in Costings, and the operator confirmed exactly those
 * prices. If Costings changed after the dialog opened, the push is refused
 * rather than publishing a price nobody looked at.
 */
export function checkPushPrices(
  category: string,
  toPush: FamilySize[],
  confirmed: ConfirmedPrice[],
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
    return !seen || seen.costCents !== size.costCents || seen.msrpCents !== size.msrpCents;
  });
  if (changed) {
    return {
      reason: "changed",
      message: "Prices changed in Costings since you checked them. Check them again.",
    };
  }
  return null;
}

/** One Storefront product as the In the shop tab shows it. */
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
  /** Why it cannot be switched on, or null when it can. */
  blocker: string | null;
};

type ListableVariant = { price: number | string | null; is_active: boolean };

/**
 * Why a product cannot go in the shop yet, or null. Only the Variants that will
 * be sold count: the active ones, or, for a product whose every Variant is off
 * (as the old per-family switch left them), all of them, because listing turns
 * them back on.
 */
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

/**
 * Costings, opened on just these Items (the page reads `?items=`), so a new
 * Item's cost and MSRP are one step from the Inventory page. Not locale
 * prefixed: callers pass it through `withLocale`.
 */
export function costingsHrefFor(itemIds: number[]): string {
  return `/settings/costings?items=${[...new Set(itemIds)].join(",")}`;
}

/** The item ids `costingsHrefFor` wrote, from a query string. Junk is dropped. */
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
