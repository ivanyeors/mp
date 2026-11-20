import type { SupabaseClient } from "@supabase/supabase-js";
import { stockLinesForOrderItem } from "./inventory-deduction";

interface OrderItemRow {
  id: string;
  order_id: string;
  variant_id: string | null;
  quantity: number;
  returned_quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
}

export function restockQuantityAllowed(
  sold: number,
  returned: number,
  request: number
): boolean {
  return Number.isInteger(request) && request > 0 && returned + request <= sold;
}

async function loadOrderItem(
  admin: SupabaseClient,
  orderId: string,
  orderItemId: string
): Promise<OrderItemRow> {
  const { data, error } = await admin
    .from("order_items")
    .select(
      "id, order_id, variant_id, quantity, returned_quantity, customization_id, customization_snapshot"
    )
    .eq("id", orderItemId)
    .eq("order_id", orderId)
    .single();

  if (error || !data) throw new Error("Order item not found");
  return data as OrderItemRow;
}

function restockMetadata(
  orderId: string,
  orderItemId: string,
  stripeRefundId?: string | null
): Record<string, unknown> {
  return {
    order_id: orderId,
    order_item_id: orderItemId,
    restock: true,
    ...(stripeRefundId ? { stripe_refund_id: stripeRefundId } : {}),
  };
}

type RestockRow = { item_id: number; quantity_signed: number; reason: string; metadata: Record<string, unknown> };

export function reverseSaleRows(
  saleRows: Array<{ item_id: number; quantity_signed: number }>,
  sold: number,
  units: number,
  metadata: Record<string, unknown>
): RestockRow[] {
  const perItem = new Map<number, number>();
  for (const r of saleRows) perItem.set(r.item_id, (perItem.get(r.item_id) ?? 0) - r.quantity_signed);
  return [...perItem]
    .map(([item_id, out]) => ({ item_id, quantity_signed: Math.round((out * units) / sold), reason: "receive", metadata }))
    .filter((r) => r.quantity_signed > 0);
}

async function resultRestockTransactions(
  admin: SupabaseClient,
  item: OrderItemRow,
  units: number,
  metadata: Record<string, unknown>
): Promise<RestockRow[]> {
  const resultId = (item.customization_snapshot as { result_id?: unknown } | null)?.result_id;
  if (typeof resultId !== "string") return [];
  const { data, error } = await admin
    .from("inventory_transactions")
    .select("item_id, quantity_signed")
    .eq("reason", "sale")
    .eq("metadata->>order_id", item.order_id)
    .eq("metadata->>result_id", resultId);
  if (error) throw new Error(error.message);
  return reverseSaleRows(data ?? [], item.quantity, units, { ...metadata, result_id: resultId });
}

async function buildRestockTransactions(
  admin: SupabaseClient,
  item: OrderItemRow,
  units: number,
  metadata: Record<string, unknown>
): Promise<RestockRow[]> {
  if (!item.variant_id) return resultRestockTransactions(admin, item, units, metadata);

  const { data: variant, error } = await admin
    .from("product_variants")
    .select("id, pillow_product_id, item_id, track_inventory, option1")
    .eq("id", item.variant_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!variant) return [];

  const lines = (await stockLinesForOrderItem(admin, variant, item)) ?? [];
  return lines.map((line) => ({
    item_id: line.item_id,
    quantity_signed: line.quantity * units,
    reason: "receive",
    metadata: { ...metadata },
  }));
}

export async function restockOrderItem(
  admin: SupabaseClient,
  orderId: string,
  orderItemId: string,
  units: number,
  opts?: { stripeRefundId?: string | null }
): Promise<{ returnedQuantity: number }> {
  const item = await loadOrderItem(admin, orderId, orderItemId);

  if (!restockQuantityAllowed(item.quantity, item.returned_quantity, units)) {
    throw new Error(
      `Cannot restock ${units} unit(s): ${item.returned_quantity} of ${item.quantity} already returned`
    );
  }

  const metadata = restockMetadata(orderId, orderItemId, opts?.stripeRefundId);
  const txns = await buildRestockTransactions(admin, item, units, metadata);

  if (txns.length > 0) {
    const { error } = await admin.from("inventory_transactions").insert(txns);
    if (error) throw new Error(error.message);
  }

  const newReturned = item.returned_quantity + units;
  const { error: updErr } = await admin
    .from("order_items")
    .update({ returned_quantity: newReturned })
    .eq("id", orderItemId);

  if (updErr) throw new Error(updErr.message);

  return { returnedQuantity: newReturned };
}
