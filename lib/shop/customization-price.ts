import {
  priceComposedBuild,
  type ComposedPriceResult,
  type PricedComponent,
} from "@/lib/pricing/composed-price";
import type { ConfigLine } from "@/lib/types/customization";

export type CustomizationPricingInputs = {
  msrp_by_family: Record<string, number>;
  default_cover: PricedComponent | null;
  default_case: PricedComponent | null;
  case_options: PricedComponent[];
  cover_options: PricedComponent[];
  shelf_price: number | null;
};

const CASE_ROLES = new Set(["case", "pillow_case", "bolster_case"]);

export type CustomizedBuildInput = {
  pricing: CustomizationPricingInputs;
  lines: ConfigLine[];
  baseQuantityByItem: Map<number, number>;
  msrpByItem: Map<number, number | null>;
};

export function priceCustomizedBuild(input: CustomizedBuildInput): ComposedPriceResult {
  const { pricing, lines, baseQuantityByItem, msrpByItem } = input;

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

export function customizationDelta(
  result: ComposedPriceResult,
  shelfPrice: number | null,
): number | null {
  if (!result.ok || shelfPrice == null) return null;
  return Number((result.subtotal - shelfPrice).toFixed(2));
}
