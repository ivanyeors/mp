/**
 * Sell price for a shop / mp-maker customization, through the one pricing rule.
 *
 * The shop customizer used to charge `(quantity above BOM) x full item MSRP`, which
 * reads a SWAP as an extra part. Picking Fibrecool over the linen case a basic XS
 * ships left linen at 0 and Fibrecool at 1, so it billed the whole 88 on top of a
 * Costings row that already includes a 65 case: 258 charged where Costings says 193.
 * Moving the other way was worse. A cheaper fabric produced a negative surcharge,
 * and `addonAmount <= 0` was dropped on the floor, so the downgrade still paid for
 * the dearer build.
 *
 * This is the adapter from the shop's `ConfigLine[]` to `priceComposedBuild`, and
 * nothing more — it decides no prices of its own. It is pure and client-safe on
 * purpose: the preview and the money path run the same function over the same
 * Costings inputs, so the number shown is the number charged.
 */

import {
  priceComposedBuild,
  type ComposedPriceResult,
  type PricedComponent,
} from "@/lib/pricing/composed-price";
import type { ConfigLine } from "@/lib/types/customization";

/** Costings inputs exactly as `/api/shop/customize` serialises them for the preview. */
export type CustomizationPricingInputs = {
  msrp_by_family: Record<string, number>;
  default_cover: PricedComponent | null;
  default_case: PricedComponent | null;
  case_options: PricedComponent[];
  cover_options: PricedComponent[];
  /** The default build's price — what the storefront variant carries. */
  shelf_price: number | null;
};

/** `ConfigLine.category` is a ROLE, already normalised by `toComponentRole`. */
const CASE_ROLES = new Set(["case", "pillow_case", "bolster_case"]);

export type CustomizedBuildInput = {
  pricing: CustomizationPricingInputs;
  lines: ConfigLine[];
  /** BOM quantity per item — what this build ships before the shopper touches it. */
  baseQuantityByItem: Map<number, number>;
  /**
   * Costings MSRP for components the option lists do not carry (protectors,
   * packaging, bolster cases). A missing entry is `null`, never 0 — an unpriced
   * component is refused by `priceComposedBuild` rather than given away.
   */
  msrpByItem: Map<number, number | null>;
};

export function priceCustomizedBuild(input: CustomizedBuildInput): ComposedPriceResult {
  const { pricing, lines, baseQuantityByItem, msrpByItem } = input;

  // A swap replaces however many the BOM ships, so the cover and case roles measure
  // "extra" against the ROLE's quantity rather than against the swapped-in item's
  // own base of zero. A premium build ships two covers; a third is one extra.
  const coverQuantity = pricing.default_cover?.quantity ?? 1;
  const caseQuantity = pricing.default_case?.quantity ?? 1;

  const optionById = new Map<number, PricedComponent>();
  for (const c of [...pricing.case_options, ...pricing.cover_options]) {
    optionById.set(c.item_id, c);
  }

  let chosenCover: PricedComponent | null = null;
  let chosenCase: PricedComponent | null = null;
  const addonLines: Array<{ msrp: number | null; quantity: number }> = [];

  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const option = optionById.get(line.item_id);
    // `line.price_delta` is deliberately NOT read: it arrives from the browser, and
    // a shopper must not get to name the price of their own upgrade.
    const msrp = option?.msrp ?? msrpByItem.get(line.item_id) ?? null;

    if (line.category === "cover") {
      chosenCover = { item_id: line.item_id, msrp, quantity: coverQuantity };
      if (line.quantity > coverQuantity) {
        addonLines.push({ msrp, quantity: line.quantity - coverQuantity });
      }
      continue;
    }

    if (CASE_ROLES.has(line.category)) {
      chosenCase = {
        item_id: line.item_id,
        msrp,
        family: option?.family ?? null,
        quantity: caseQuantity,
      };
      if (line.quantity > caseQuantity) {
        addonLines.push({ msrp, quantity: line.quantity - caseQuantity });
      }
      continue;
    }

    // Protectors and packaging are genuine extras: they are added to the build
    // rather than substituted into it, so they cost full MSRP above the BOM.
    const extra = line.quantity - (baseQuantityByItem.get(line.item_id) ?? 0);
    if (extra > 0) addonLines.push({ msrp, quantity: extra });
  }

  return priceComposedBuild({
    msrpByFamily: pricing.msrp_by_family,
    defaultCover: pricing.default_cover,
    defaultCase: pricing.default_case,
    caseOptions: pricing.case_options,
    chosenCover,
    chosenCase,
    addonLines,
  });
}

/**
 * What to add to the storefront variant's shelf price for this build.
 *
 * Signed. A case cheaper than the one the BOM ships gives a NEGATIVE number and
 * callers must carry it through rather than clamping at zero — clamping is what
 * charged a premium S shopper 400 for the 430 Fibrecool build's cheaper sibling.
 */
export function customizationDelta(
  result: ComposedPriceResult,
  shelfPrice: number | null,
): number | null {
  if (!result.ok || shelfPrice == null) return null;
  return Number((result.subtotal - shelfPrice).toFixed(2));
}
