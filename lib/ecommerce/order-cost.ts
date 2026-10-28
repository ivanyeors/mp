/** One Item and how many of it a unit takes out of stock. */
export type CostLine = { item_id: number; quantity: number };

/**
 * Cost of a build from Costings: `quantity × cost` per line. An Item with no
 * cost price adds 0, the rule `assembleBuild` freezes a Result's COGS by and the
 * Costings page shows a build cost by, so every platform sale is costed alike.
 */
export function buildLinesCost(lines: CostLine[], costByItem: Map<number, number>): number {
  let total = 0;
  for (const line of lines) {
    total += line.quantity * (costByItem.get(line.item_id) ?? 0);
  }
  return Math.round(total * 100) / 100;
}

/**
 * COGS frozen on an order line at sale.
 *
 * A line whose sale takes Items out of stock costs exactly those Items
 * (`stockLinesForOrderItem`): a customised pillow's chosen cover and case, its
 * recipe and its fillings. Costing the Variant's own `cost_price` plus extras
 * instead left the fillings out, because a recipe carries none (ADR 0003). A
 * Variant with no Item behind it is costed at its own `cost_price`.
 */
export function resolveOrderItemUnitCost(params: {
  variantCostPrice: number | null;
  quantity: number;
  /** What one unit deducts; `null` or empty when the Variant has no Item behind it. */
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
