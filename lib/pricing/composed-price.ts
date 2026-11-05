/**
 * Sell price for a composed pillow / bolster build. Pure, and deliberately free of
 * `supabaseAdmin` so the configurator preview can call the same function the money
 * path calls — they showed different numbers for the same build before this existed.
 *
 * The model, confirmed against Costings:
 *
 *   price = the Costings row for the chosen case's fabric family
 *         + (chosen cover MSRP - the cover that row was priced with)
 *         + (chosen case  MSRP - the case  that row was priced with)
 *         + add-ons at full MSRP
 *
 * A Costings row is the whole selling price of one configuration, not a
 * cover/case-exclusive core: premium XS with a linen case is 340 and with Fibrecool
 * is 360, and those two do not share a core (250 vs 247). So the row is selected,
 * then only components differing from what it was priced with move the total.
 *
 * Basic and Mbolster have a single unkeyed row and reach the same answer through the
 * same path: no family row matches, the unkeyed row is used, and the baseline is the
 * BOM's own default case.
 *
 * What goes inside the pillow is in the row: every filling, and a Cervical Neck
 * Support placed in a premium pillow too, so placing one or taking it out never
 * moves the price off the pillow's MSRP. An Ear Comfort Pad is the exception: one
 * placed in the pillow adds its own MSRP per piece (`placedChargeLines`), as one
 * picked as an Add-on beside the pillow does.
 */

import { isEarPadItem } from "@/lib/spatial-fillings/filling-groups";

/** `product_prices.variant` for a pillow row — `items.price_family` of its case. */
export type PriceFamily = string;

/** Key under which an unkeyed Costings row (basic, bolster) is stored. */
export const UNKEYED = "";

export type PricedComponent = {
  item_id: number;
  /** Costings item MSRP. `null` means nobody priced it — never silently zero. */
  msrp: number | null;
  /** Fabric family for a case; `null`/absent for covers. */
  family?: PriceFamily | null;
  /**
   * How many ship. Defaults to 1, and only the BOM default's value is used: a
   * preference substitutes at the BOM's quantity, so a premium pillow that ships
   * TWO covers moves by two covers' difference when the shopper swaps fabric.
   */
  quantity?: number;
};

export type ComposedPriceInput = {
  /** Costings MSRPs by `product_prices.variant`, plus `UNKEYED` for an unkeyed row. */
  msrpByFamily: Record<string, number>;
  /** Cover and case the composed BOM ships by default. */
  defaultCover: PricedComponent | null;
  defaultCase: PricedComponent | null;
  /** Every case offered for this size, used to derive each family's baseline. */
  caseOptions: PricedComponent[];
  /** What the shopper picked; `null` keeps the BOM default. */
  chosenCover: PricedComponent | null;
  chosenCase: PricedComponent | null;
  addonLines: Array<{ msrp: number | null; quantity: number }>;
};

export type ComposedPriceBreakdown = {
  /** The Costings row used. */
  base: number;
  /** `product_prices.variant` of that row, or null when the unkeyed row was used. */
  family: PriceFamily | null;
  coverDelta: number;
  caseDelta: number;
  addons: number;
  subtotal: number;
};

export type ComposedPriceResult =
  | ({ ok: true } & ComposedPriceBreakdown)
  | { ok: false; code: "no_price" | "unpriced_component"; error: string };

/**
 * The case MSRP each family's Costings row was priced with.
 *
 * Cases inside a family share an MSRP at a given size today (both linens are 65 at
 * XS), so this is normally just "the family's case price". The minimum is taken so
 * that if they ever diverge the baseline is the cheapest member and picking a dearer
 * one adds the difference, rather than the total depending on map ordering.
 */
export function baselineCaseMsrpByFamily(
  caseOptions: PricedComponent[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [family, c] of Object.entries(baselineCaseByFamily(caseOptions))) {
    out[family] = c.msrp!;
  }
  return out;
}

/**
 * The case each family's Costings row was priced with: the cheapest priced member,
 * the lower item id on a tie. Costings reads it to cost the build the row prices.
 */
export function baselineCaseByFamily(
  caseOptions: PricedComponent[],
): Record<string, PricedComponent> {
  const out: Record<string, PricedComponent> = {};
  for (const c of caseOptions) {
    if (!c.family || c.msrp == null) continue;
    const seen = out[c.family];
    if (seen == null || c.msrp < seen.msrp! || (c.msrp === seen.msrp && c.item_id < seen.item_id)) {
      out[c.family] = c;
    }
  }
  return out;
}

export function priceComposedBuild(input: ComposedPriceInput): ComposedPriceResult {
  const cover = input.chosenCover ?? input.defaultCover;
  const chosenCase = input.chosenCase ?? input.defaultCase;

  // A component with no MSRP is refused, never counted as free. XL Fibrecool
  // (item 37) is exactly this: no MSRP and no price row, so XL is linen-only until
  // someone prices it. Treating null as 0 would have sold it BELOW the linen price.
  for (const [label, c] of [
    ["cover", cover],
    ["case", chosenCase],
  ] as const) {
    if (c && c.msrp == null) {
      return {
        ok: false,
        code: "unpriced_component",
        error: `Selected ${label} (item ${c.item_id}) has no Costings MSRP`,
      };
    }
  }
  const unpricedAddon = input.addonLines.find((l) => l.msrp == null);
  if (unpricedAddon) {
    return { ok: false, code: "unpriced_component", error: "An add-on has no Costings MSRP" };
  }

  const wantedFamily = chosenCase?.family ?? null;
  const familyBase = wantedFamily == null ? undefined : input.msrpByFamily[wantedFamily];
  const base = familyBase ?? input.msrpByFamily[UNKEYED];
  if (base == null) {
    return {
      ok: false,
      code: "no_price",
      error: wantedFamily
        ? `No Costings MSRP for this size in family "${wantedFamily}", and no unkeyed row`
        : "No Costings MSRP for this size",
    };
  }

  // Which case the chosen row was priced with. A family row was priced with that
  // family's case; the unkeyed row was priced with the BOM's own default.
  const baseline =
    familyBase != null
      ? (baselineCaseMsrpByFamily(input.caseOptions)[wantedFamily!] ?? null)
      : (input.defaultCase?.msrp ?? null);

  // A delta has TWO operands and both must be priced. Refusing only the chosen one
  // made an unpriced BASELINE hand the upgrade away free: an unpriced default case
  // with a Fibrecool chosen still charged the bare row.
  if (chosenCase != null && baseline == null) {
    return {
      ok: false,
      code: "unpriced_component",
      error: wantedFamily
        ? `No priced case in family "${wantedFamily}" to price this size against`
        : `The default case (item ${input.defaultCase?.item_id ?? "?"}) has no Costings MSRP`,
    };
  }
  if (cover != null && input.defaultCover != null && input.defaultCover.msrp == null) {
    return {
      ok: false,
      code: "unpriced_component",
      error: `The default cover (item ${input.defaultCover.item_id}) has no Costings MSRP`,
    };
  }

  const caseQuantity = input.defaultCase?.quantity ?? 1;
  const caseDelta =
    chosenCase == null || baseline == null
      ? 0
      : ((chosenCase.msrp ?? 0) - baseline) * caseQuantity;
  const coverQuantity = input.defaultCover?.quantity ?? 1;
  const coverDelta =
    cover == null || input.defaultCover?.msrp == null
      ? 0
      : ((cover.msrp ?? 0) - input.defaultCover.msrp) * coverQuantity;
  const addons = input.addonLines.reduce((s, l) => s + (l.msrp ?? 0) * l.quantity, 0);

  return {
    ok: true,
    base,
    family: familyBase != null ? wantedFamily : null,
    coverDelta,
    caseDelta,
    addons,
    subtotal: base + coverDelta + caseDelta + addons,
  };
}

const CASE_ROLE_CATEGORIES = new Set(["case", "pillow_case", "bolster_case"]);

/**
 * Split stored Customer preference lines into the chosen cover and case.
 *
 * Family and MSRP come from the caller's own `items` / `item_prices` lookup, NOT from
 * membership of the assigned size's option list. Staff re-assigning a size (XS to S)
 * leaves the stored case foreign to the new size's options; reading the family from
 * that list turned a legitimate build into "This build cannot be priced yet. Check
 * Costings" on premium, and into a delta measured against the wrong family on basic.
 */
export function resolvePreferences(
  preferenceLines: Array<{ item_id: number; category: string }>,
  msrpByItem: Map<number, number>,
  familyByItem: Map<number, string | null>,
): { chosenCover: PricedComponent | null; chosenCase: PricedComponent | null } {
  let chosenCover: PricedComponent | null = null;
  let chosenCase: PricedComponent | null = null;
  for (const l of preferenceLines) {
    if (l.category === "cover") {
      chosenCover = { item_id: l.item_id, msrp: msrpByItem.get(l.item_id) ?? null };
    } else if (CASE_ROLE_CATEGORIES.has(l.category)) {
      chosenCase = {
        item_id: l.item_id,
        msrp: msrpByItem.get(l.item_id) ?? null,
        family: familyByItem.get(l.item_id) ?? null,
      };
    }
  }
  return { chosenCover, chosenCase };
}

/**
 * Charge lines for the pieces placed in the x-ray that the Costings row does not
 * cover. Fillings and a Neck support are in the row, so they add nothing; an Ear
 * Comfort Pad costs its own MSRP per piece. An unpriced one comes back as
 * `msrp: null`, which priceComposedBuild refuses, never zero.
 */
export function placedChargeLines(
  pack: ReadonlyArray<{ item_id: number; count: number }>,
  itemById: ReadonlyMap<number, { category?: string | null; name: string }>,
  msrpByItem: ReadonlyMap<number, number>,
): Array<{ msrp: number | null; quantity: number }> {
  return pack.flatMap((l) => {
    const item = itemById.get(l.item_id);
    return item && isEarPadItem(item)
      ? [{ msrp: msrpByItem.get(l.item_id) ?? null, quantity: l.count }]
      : [];
  });
}
