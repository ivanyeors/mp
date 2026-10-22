/**
 * Manual restock for returned order goods. Refunds never auto-restock (slice 07);
 * staff deliberately restock here and we link inventory rows + returned_quantity.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isBolsterCustomizedItem,
  isBolsterVariant,
  mergeBolsterCustomLines,
  mergePillowCustomLines,
} from "./inventory-deduction";

interface OrderItemRow {
  id: string;
  order_id: string;
  variant_id: string | null;
  quantity: number;
  returned_quantity: number;
  customization_id?: string | null;
  customization_snapshot?: Record<string, unknown> | null;
}

type CustomizationSnapshot = {
  product_type?: string;
  bolster_variant?: string;
  config_lines?: Array<{ item_id: number; quantity: number }>;
  filling_lines?: Array<{ item_id: number; quantity: number }>;
};

/** Pure guard: cannot restock more product units than were sold. */
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

/** Reverses a line's sale rows pro rata: `units` of `sold` units come back. */
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

/** A Result line has no Variant: its stock left as sale rows tagged with the Result. */
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

/** BOM-aware positive inventory rows for `units` of one order line. */
async function buildRestockTransactions(
  admin: SupabaseClient,
  item: OrderItemRow,
  units: number,
  metadata: Record<string, unknown>
): Promise<RestockRow[]> {
  if (!item.variant_id) return resultRestockTransactions(admin, item, units, metadata);

  const { data: variant } = await admin
    .from("product_variants")
    .select("id, pillow_product_id, item_id, track_inventory, option1")
    .eq("id", item.variant_id)
    .single();

  if (!variant || !variant.track_inventory) return [];

  const snapshot = (item.customization_snapshot ?? {}) as CustomizationSnapshot;
  const meta = { ...metadata };

  if (isBolsterCustomizedItem(variant, item, snapshot)) {
    const bolsterVariant =
      (isBolsterVariant(snapshot.bolster_variant) ? snapshot.bolster_variant : null) ??
      (isBolsterVariant(variant.option1?.toLowerCase()) ? variant.option1!.toLowerCase() : null);
    if (!bolsterVariant) return [];

    const lines = await mergeBolsterCustomLines(bolsterVariant, snapshot.config_lines ?? []);
    return lines.map((line) => ({
      item_id: line.item_id,
      quantity_signed: line.quantity * units,
      reason: "receive",
      metadata: meta,
    }));
  }

  if (variant.pillow_product_id && item.customization_id && item.customization_snapshot) {
    const lines = await mergePillowCustomLines(variant.pillow_product_id, snapshot);
    return lines.map((line) => ({
      item_id: line.item_id,
      quantity_signed: line.quantity * units,
      reason: "receive",
      metadata: meta,
    }));
  }

  if (variant.pillow_product_id) {
    const { data: bomLines } = await admin
      .from("bom_lines")
      .select("item_id, quantity")
      .eq("product_id", variant.pillow_product_id);
    return (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => ({
      item_id: bl.item_id,
      quantity_signed: bl.quantity * units,
      reason: "receive",
      metadata: meta,
    }));
  }

  const bolsterVariant = variant.option1?.toLowerCase();
  if (isBolsterVariant(bolsterVariant)) {
    const { data: bomLines } = await admin
      .from("bolster_bom_lines")
      .select("item_id, quantity")
      .eq("variant", bolsterVariant);
    return (bomLines ?? []).map((bl: { item_id: number; quantity: number }) => ({
      item_id: bl.item_id,
      quantity_signed: bl.quantity * units,
      reason: "receive",
      metadata: meta,
    }));
  }

  if (variant.item_id) {
    return [
      {
        item_id: variant.item_id,
        quantity_signed: units,
        reason: "receive",
        metadata: meta,
      },
    ];
  }

  return [];
}

/**
 * Restock `units` of a sold order line into inventory and bump returned_quantity.
 */
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
