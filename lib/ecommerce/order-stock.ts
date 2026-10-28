/**
 * Taking an Order's goods out of stock exactly once. Result Accept, Staff-made
 * Orders and the Order page's "Deduct stock" all come through here. The Stripe
 * webhook keeps its own claim on the same column.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { deductInventoryForOrder, type OrderItemForDeduction } from "./inventory-deduction";
import { isSoldOrderStatus } from "./sold-status";

export type DeductOrderStockResult = "deducted" | "already_deducted";

/**
 * Take an Order's goods out of stock once.
 *
 * `orders.inventory_deducted_at` is the claim. The call that sets it deducts.
 * Any other call, concurrent or later, finds it set and returns. An Order whose
 * sale rows were written before the claim existed keeps them and is only
 * claimed. A failed deduction hands the claim back, so a retry deducts, and throws.
 */
export async function deductOrderStock(
  admin: SupabaseClient,
  orderId: string,
): Promise<DeductOrderStockResult> {
  const { data: claimed, error: claimError } = await admin
    .from("orders")
    .update({ inventory_deducted_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("inventory_deducted_at", null)
    .select("id")
    .maybeSingle();
  if (claimError) throw new Error(`Could not claim the stock deduction: ${claimError.message}`);
  if (!claimed) return "already_deducted";

  try {
    const { count, error: countError } = await admin
      .from("inventory_transactions")
      .select("id", { count: "exact", head: true })
      .eq("reason", "sale")
      .eq("metadata->>order_id", orderId);
    if (countError) throw new Error(countError.message);
    if ((count ?? 0) > 0) return "already_deducted";

    const { data: items, error: itemsError } = await admin
      .from("order_items")
      .select("variant_id, quantity, kind, customization_id, customization_snapshot")
      .eq("order_id", orderId);
    if (itemsError) throw new Error(itemsError.message);

    await deductInventoryForOrder(orderId, (items ?? []) as OrderItemForDeduction[], admin);
    return "deducted";
  } catch (err) {
    await admin.from("orders").update({ inventory_deducted_at: null }).eq("id", orderId);
    throw err;
  }
}

/**
 * `deductOrderStock`, tried up to `attempts` times. When every attempt fails, the
 * Order is flagged `needs_attention` with a `stock_not_deducted` timeline event,
 * and Staff deduct it from the Order page once the cause is fixed. Never throws:
 * the sale has already happened.
 */
export async function deductOrderStockOrFlag(
  admin: SupabaseClient,
  orderId: string,
  attempts = 1,
): Promise<{ ok: true; result: DeductOrderStockResult } | { ok: false; error: string }> {
  let error = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return { ok: true, result: await deductOrderStock(admin, orderId) };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      if (attempt < attempts) await new Promise((r) => setTimeout(r, 200 * attempt));
    }
  }

  console.error(`[order-stock] Stock not deducted for order ${orderId}: ${error}`);
  await admin.from("orders").update({ needs_attention: true }).eq("id", orderId);
  await admin.from("order_timeline").insert({
    order_id: orderId,
    event_type: "stock_not_deducted",
    message: `Stock was not taken out for this order: ${error}. Use "Deduct stock" on this page once the cause is fixed.`,
    metadata: { reason: error },
  });
  return { ok: false, error };
}

/**
 * An Order becoming sold takes its stock out: call on every status change, with
 * the status before and after. Staying sold, or never becoming sold, deducts
 * nothing, so an Order sold before this rule is not deducted again by a later
 * change. An Order that missed its deduction is deducted from the Order page.
 */
export async function deductStockWhenSold(
  admin: SupabaseClient,
  orderId: string,
  before: string | null | undefined,
  after: string | null | undefined,
) {
  if (!isSoldOrderStatus(after) || isSoldOrderStatus(before)) return null;
  return deductOrderStockOrFlag(admin, orderId);
}
