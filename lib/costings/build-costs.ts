import { baselineCaseByFamily } from "@/lib/pricing/composed-price";

export type CostComponent = { itemId: number; quantity: number };

export type FillingTemplateRecipe = {
  id: number;
  name: string;
  pack: Array<{ itemId: number; count: number }>;
};

export type CaseCandidate = {
  itemId: number;
  family: string | null;
  msrpCents: number | null;
};

export type BuildCostOption = {
  templateId: number;
  name: string;
  isDefault: boolean;
  lines: CostComponent[];
  pieces: number;
  fillingCents: number;
  buildCents: number;
  neckSupport: "none" | "included" | "left_out";
  earPad: "none" | "charged" | "left_out";
  extraChargeCents: number | null;
  uncostedItemIds: number[];
};

export type BuildCosts = {
  baseCents: number;
  baseUncostedItemIds: number[];
  options: BuildCostOption[];
};

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

export function swapComponent(
  components: CostComponent[],
  fromItemId: number,
  toItemId: number,
): CostComponent[] {
  if (fromItemId === toItemId) return components;
  return components.map((c) => (c.itemId === fromItemId ? { ...c, itemId: toItemId } : c));
}

export function buildCostOptions(input: {
  baseComponents: CostComponent[];
  templates: FillingTemplateRecipe[];
  defaultTemplateId: number | null;
  costByItem: ReadonlyMap<number, number | null>;
  neckSupportItemIds: ReadonlySet<number>;
  earPadMsrpByItem: ReadonlyMap<number, number | null>;
  allowNeckSupport: boolean;
}): BuildCosts {
  const base = componentsCostCents(input.baseComponents, input.costByItem);
  const options: BuildCostOption[] = [];

  for (const template of input.templates) {
    const isNeck = (l: { itemId: number }) => input.neckSupportItemIds.has(l.itemId);
    const isEar = (l: { itemId: number }) => input.earPadMsrpByItem.has(l.itemId);
    const hasNeck = template.pack.some(isNeck);
    const earLines = template.pack.filter(isEar);
    const shipped = input.allowNeckSupport ? template.pack : template.pack.filter((l) => !isNeck(l) && !isEar(l));
    const lines = shipped.map((l) => ({ itemId: l.itemId, quantity: l.count }));
    const filling = componentsCostCents(lines, input.costByItem);
    let extraChargeCents: number | null = 0;
    if (input.allowNeckSupport) {
      for (const l of earLines) {
        const msrp = input.earPadMsrpByItem.get(l.itemId) ?? null;
        extraChargeCents = msrp == null || extraChargeCents == null ? null : extraChargeCents + msrp * l.count;
      }
    }
    options.push({
      templateId: template.id,
      name: template.name,
      isDefault: template.id === input.defaultTemplateId,
      lines,
      pieces: shipped.reduce((sum, l) => sum + l.count, 0),
      fillingCents: filling.cents,
      buildCents: base.cents + filling.cents,
      neckSupport: !hasNeck ? "none" : input.allowNeckSupport ? "included" : "left_out",
      earPad: earLines.length === 0 ? "none" : input.allowNeckSupport ? "charged" : "left_out",
      extraChargeCents,
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

export function costRange(cents: number[]): { min: number; max: number } | null {
  if (cents.length === 0) return null;
  return { min: Math.min(...cents), max: Math.max(...cents) };
}

export function marginPct(sellCents: number | null, costCents: number): number | null {
  if (sellCents == null || sellCents <= 0) return null;
  return ((sellCents - costCents) / sellCents) * 100;
}
