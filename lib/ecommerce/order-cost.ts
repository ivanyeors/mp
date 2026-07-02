import type { ConfigLine, FillingLine } from "@/lib/types/customization";

/** Full BOM cost from a customization snapshot (all config + filling lines). */
export function calculateCustomizationBomCost(
  config_lines: ConfigLine[],
  filling_lines: FillingLine[],
  costByItem: Map<number, number>,
): number {
  let total = 0;
  for (const line of filling_lines) {
    total += line.quantity * (costByItem.get(line.item_id) ?? 0);
  }
  for (const line of config_lines) {
    total += line.quantity * (costByItem.get(line.item_id) ?? 0);
  }
  return total;
}

/** Addon COGS only: extra component qty above base BOM × item cost. */
export function calculateAddonCost(
  componentQuantities: ConfigLine[],
  baseQuantities: Map<number, number>,
  costByItem: Map<number, number>,
): number {
  let total = 0;
  for (const comp of componentQuantities) {
    const baseQty = baseQuantities.get(comp.item_id) ?? 0;
    const extraQty = Math.max(0, comp.quantity - baseQty);
    if (extraQty > 0) {
      total += extraQty * (costByItem.get(comp.item_id) ?? 0);
    }
  }
  return total;
}

export function resolveOrderItemUnitCost(params: {
  variantCostPrice: number | null;
  quantity: number;
  customization?: {
    config_lines: ConfigLine[];
    baseQuantities: Map<number, number>;
    costByItem: Map<number, number>;
  };
}): { unit_cost: number | null; total_cost: number | null } {
  if (!params.customization) {
    const unit_cost = params.variantCostPrice;
    return {
      unit_cost,
      total_cost: unit_cost != null ? unit_cost * params.quantity : null,
    };
  }

  const addonCost = calculateAddonCost(
    params.customization.config_lines,
    params.customization.baseQuantities,
    params.customization.costByItem,
  );
  const unit_cost = (params.variantCostPrice ?? 0) + addonCost;
  return {
    unit_cost,
    total_cost: unit_cost * params.quantity,
  };
}
