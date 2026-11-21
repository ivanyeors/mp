import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrderItemUnitCost } from "@/lib/ecommerce/order-cost";
import { stockLinesForOrderItem, type StockVariant } from "@/lib/ecommerce/inventory-deduction";

export type CostableOrderLine = {
  variant: (StockVariant & { cost_price: number | string | null }) | null;
  quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
};

function toCost(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function orderLinesCosts(
  admin: SupabaseClient,
  lines: CostableOrderLine[],
): Promise<Array<{ unit_cost: number | null; total_cost: number | null }>> {
  const builds = await Promise.all(
    lines.map((line) =>
      line.variant
        ? stockLinesForOrderItem(admin, line.variant, {
            customization_id: line.customization_id ?? null,
            customization_snapshot: line.customization_snapshot ?? null,
          })
        : Promise.resolve(null),
    ),
  );

  const itemIds = [...new Set(builds.flatMap((b) => (b ?? []).map((l) => l.item_id)))];
  const costByItem = new Map<number, number>();
  if (itemIds.length) {
    const { data, error } = await admin.from("item_prices").select("item_id, cost_price").in("item_id", itemIds);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const cost = toCost(row.cost_price);
      if (cost != null) costByItem.set(Number(row.item_id), cost);
    }
  }

  return lines.map((line, i) =>
    resolveOrderItemUnitCost({
      variantCostPrice: line.variant ? toCost(line.variant.cost_price) : null,
      quantity: line.quantity,
      buildLines: builds[i],
      costByItem,
    }),
  );
}
