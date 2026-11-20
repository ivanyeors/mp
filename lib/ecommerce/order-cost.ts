export type CostLine = { item_id: number; quantity: number };

export function buildLinesCost(lines: CostLine[], costByItem: Map<number, number>): number {
  let total = 0;
  for (const line of lines) {
    total += line.quantity * (costByItem.get(line.item_id) ?? 0);
  }
  return Math.round(total * 100) / 100;
}

export function resolveOrderItemUnitCost(params: {
  variantCostPrice: number | null;
  quantity: number;
  buildLines?: CostLine[] | null;
  costByItem?: Map<number, number>;
}): { unit_cost: number | null; total_cost: number | null } {
  const unit_cost =
    params.buildLines?.length
      ? buildLinesCost(params.buildLines, params.costByItem ?? new Map())
      : params.variantCostPrice;
  return {
    unit_cost,
    total_cost: unit_cost != null ? Math.round(unit_cost * params.quantity * 100) / 100 : null,
  };
}
