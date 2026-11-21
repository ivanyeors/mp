import type { SupabaseClient } from "@supabase/supabase-js";
import { isPreOrder, type PreOrderTriggerInput } from "./pre-order-trigger";

export function preOrderFlagForResult(input: PreOrderTriggerInput): boolean {
  return isPreOrder(input).isPreOrder;
}

export type HoldPreOrderLookup = {
  productType: "pillow" | "bolster";
  preferenceItemIds: readonly number[];
  suggestedSize?: string;
  suggestedTier?: string;
  suggestedLength?: string;
};

export async function loadPreOrderTriggerAtHold(
  admin: SupabaseClient,
  args: HoldPreOrderLookup,
): Promise<PreOrderTriggerInput> {
  const ids = [...args.preferenceItemIds];
  const { data: balances } = ids.length
    ? await admin.from("inventory_balances").select("item_id, on_hand").in("item_id", ids)
    : { data: [] as Array<{ item_id: number; on_hand: number }> };
  const onHand = new Map(
    (balances ?? []).map((b) => [b.item_id as number, Number(b.on_hand)]),
  );
  const preferenceStocks = ids.map((id) => onHand.get(id) ?? 0);

  let composedBuildable = 0;
  if (args.productType === "pillow" && args.suggestedSize && args.suggestedTier) {
    const { data: pillowProduct } = await admin
      .from("pillow_products")
      .select("id")
      .eq("size", args.suggestedSize)
      .eq("kind", args.suggestedTier)
      .eq("is_active", true)
      .maybeSingle();
    if (pillowProduct) {
      const { data: row } = await admin
        .from("product_buildable")
        .select("buildable")
        .eq("product_id", pillowProduct.id)
        .maybeSingle();
      composedBuildable = Number(row?.buildable ?? 0);
    }
  } else if (args.productType === "bolster" && args.suggestedLength) {
    const { data: row } = await admin
      .from("bolster_buildable")
      .select("buildable")
      .eq("bolster_variant", args.suggestedLength)
      .maybeSingle();
    composedBuildable = Number(row?.buildable ?? 0);
  }

  return { preferenceStocks, composedBuildable };
}
