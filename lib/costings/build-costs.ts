/**
 * What a composed sellable costs to build, once per Filling Template that can fill it.
 *
 * A build's COGS is its composed BOM (cover, case, protector, packaging; never
 * fillings, ADR 0003) plus the Filling Template the Result is assigned, the same
 * sum `assembleBuild` makes. The template is picked per Result, so a size has no
 * single cost: it has one per template whose Size membership covers it. Pure, so
 * the Costings page reruns it on every keystroke.
 */

import { baselineCaseByFamily } from "@/lib/pricing/composed-price";

export type CostComponent = { itemId: number; quantity: number };

export type FillingTemplateRecipe = {
  id: number;
  name: string;
  /** The Derived pack list: placements when present, flat lines otherwise. */
  pack: Array<{ itemId: number; count: number }>;
};

export type CaseCandidate = {
  itemId: number;
  /** `items.price_family`; selects the Costings row (`product_prices.variant`). */
  family: string | null;
  msrpCents: number | null;
};

export type BuildCostOption = {
  templateId: number;
  name: string;
  isDefault: boolean;
  /** The filling lines this build ships: the pack list, less any Neck support it cannot take. */
  lines: CostComponent[];
  pieces: number;
  fillingCents: number;
  buildCents: number;
  /**
   * `included`: shipped inside the pillow at the row's price, its cost in the build
   * (CONTEXT.md). `left_out`: the template holds one this build cannot take.
   */
  neckSupport: "none" | "included" | "left_out";
  /** Items in the build with no cost price. They add 0 here, so the cost is a floor. */
  uncostedItemIds: number[];
};

export type BuildCosts = {
  baseCents: number;
  baseUncostedItemIds: number[];
  options: BuildCostOption[];
};

/** Sum of `quantity × cost`, counting an uncosted item as 0 and naming it. */
export function componentsCostCents(
  components: CostComponent[],
  costByItem: ReadonlyMap<number, number | null>,
): { cents: number; uncostedItemIds: number[] } {
  let cents = 0;
  const uncosted = new Set<number>();
  for (const c of components) {
    if (c.quantity <= 0) continue;
    const cost = costByItem.get(c.itemId);
    if (cost == null) {
      uncosted.add(c.itemId);
      continue;
    }
    cents += cost * c.quantity;
  }
  return { cents: Math.round(cents), uncostedItemIds: [...uncosted] };
}

/**
 * The case a premium build ships in one fabric family.
 *
 * The BOM's own case when it is already that family. Otherwise the case that
 * family's Costings row was priced with (`baselineCaseByFamily`, the pricing
 * module's rule), so cost and price describe the same pillow. An unpriced case
 * is used only when the family has no priced one. `null`: no case of that family
 * exists at this size.
 */
export function familyCaseItemId(opts: {
  bomCase: CaseCandidate | null;
  family: string;
  candidates: CaseCandidate[];
}): number | null {
  if (opts.bomCase?.family === opts.family) return opts.bomCase.itemId;
  const baseline = baselineCaseByFamily(
    opts.candidates.map((c) => ({ item_id: c.itemId, msrp: c.msrpCents, family: c.family })),
  )[opts.family];
  if (baseline) return baseline.item_id;
  const unpriced = opts.candidates.filter((c) => c.family === opts.family).sort((a, b) => a.itemId - b.itemId);
  return unpriced[0]?.itemId ?? null;
}

/** The BOM with one item swapped for another at the same quantity. */
export function swapComponent(
  components: CostComponent[],
  fromItemId: number,
  toItemId: number,
): CostComponent[] {
  if (fromItemId === toItemId) return components;
  return components.map((c) => (c.itemId === fromItemId ? { ...c, itemId: toItemId } : c));
}

/**
 * One option per Filling Template: the base build plus that template's pack list.
 * The Default Filling Template comes first, then cheapest to dearest.
 */
export function buildCostOptions(input: {
  baseComponents: CostComponent[];
  templates: FillingTemplateRecipe[];
  defaultTemplateId: number | null;
  costByItem: ReadonlyMap<number, number | null>;
  /** Neck support item ids. */
  neckSupportItemIds: ReadonlySet<number>;
  /**
   * Basic Mpillow takes no Neck support: its pieces come out of the mix, as
   * `mixAfterTierChange` takes them out of a session's, and the rest still builds.
   */
  allowNeckSupport: boolean;
}): BuildCosts {
  const base = componentsCostCents(input.baseComponents, input.costByItem);
  const options: BuildCostOption[] = [];

  for (const template of input.templates) {
    const isNeck = (l: { itemId: number }) => input.neckSupportItemIds.has(l.itemId);
    const hasNeck = template.pack.some(isNeck);
    const shipped = input.allowNeckSupport ? template.pack : template.pack.filter((l) => !isNeck(l));
    const lines = shipped.map((l) => ({ itemId: l.itemId, quantity: l.count }));
    const filling = componentsCostCents(lines, input.costByItem);
    options.push({
      templateId: template.id,
      name: template.name,
      isDefault: template.id === input.defaultTemplateId,
      lines,
      pieces: shipped.reduce((sum, l) => sum + l.count, 0),
      fillingCents: filling.cents,
      buildCents: base.cents + filling.cents,
      neckSupport: !hasNeck ? "none" : input.allowNeckSupport ? "included" : "left_out",
      uncostedItemIds: [...new Set([...base.uncostedItemIds, ...filling.uncostedItemIds])],
    });
  }

  options.sort(
    (a, b) =>
      Number(b.isDefault) - Number(a.isDefault) ||
      a.buildCents - b.buildCents ||
      a.name.localeCompare(b.name),
  );

  return { baseCents: base.cents, baseUncostedItemIds: base.uncostedItemIds, options };
}

/** Cheapest and dearest of a set of costs, or `null` when there are none. */
export function costRange(cents: number[]): { min: number; max: number } | null {
  if (cents.length === 0) return null;
  return { min: Math.min(...cents), max: Math.max(...cents) };
}

/** Gross margin as a percentage of the sell price; `null` without a positive price. */
export function marginPct(sellCents: number | null, costCents: number): number | null {
  if (sellCents == null || sellCents <= 0) return null;
  return ((sellCents - costCents) / sellCents) * 100;
}
