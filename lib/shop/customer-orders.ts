import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import type { Order } from "@/lib/types/ecommerce";

/**
 * Customer-facing order reads.
 *
 * These run through the cookie-based (anon/SSR) Supabase client so every query
 * is evaluated under the signed-in shopper's RLS context. The policies added in
 * migration 0039 ensure a customer only ever sees their own orders and items —
 * there is no application-level customer filter here on purpose, so the database
 * remains the single source of truth for access control.
 */

// Both column lists are explicit, never `*`: the authenticated role is granted
// columns one by one, and a `*` fails the whole query with "permission denied".
// It is not granted order_items' unit_cost / total_cost snapshots
// (20260915170000_hide_variant_cost_price.sql), nor orders.internal_notes
// (20261020101000_customer_notes_and_column_grants.sql). A column added to
// either table must be granted before it is listed here; cost-column-grants.test.ts
// checks both lists against the grants.
export const CUSTOMER_ORDER_COLUMNS = [
  "id", "order_number", "customer_id", "email", "phone", "status", "currency",
  "subtotal", "shipping_amount", "tax_amount", "discount_amount", "total",
  "amount_captured", "amount_refunded",
  "shipping_address", "billing_address", "shipping_method_id", "coupon_id", "coupon_code",
  "notes", "payment_method", "payment_reference", "paid_at",
  "tracking_number", "tracking_url", "shipping_courier", "shipping_tracking_status",
  "shipping_min_days", "shipping_max_days", "shipped_at", "delivered_at", "cancelled_at",
  "refund_request_status", "refund_requested_at", "refund_request_note", "refund_return_acknowledged_at",
  "shopify_order_id", "stripe_session_id", "locale", "created_at", "updated_at",
] as const;

export const CUSTOMER_ORDER_ITEM_COLUMNS = [
  "id", "order_id", "variant_id", "sku", "product_title", "variant_title", "image_url",
  "quantity", "returned_quantity", "unit_price", "total_price",
  "customization_id", "customization_snapshot", "kind", "service_key", "created_at",
] as const;

export const ORDER_WITH_ITEMS =
  `${CUSTOMER_ORDER_COLUMNS.join(", ")}, items:order_items(${CUSTOMER_ORDER_ITEM_COLUMNS.join(", ")})`;

/** An Order as its customer reads it: never the Staff-only internal notes. */
export type CustomerOrder = Omit<Order, "internal_notes">;

/** All of the signed-in customer's orders, most recent first. */
export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_ITEMS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return (data ?? []) as unknown as CustomerOrder[];
}

/**
 * A single order (with items) by order number, scoped to the signed-in customer
 * via RLS. Returns null when no matching order is visible to this customer.
 */
export async function getCustomerOrderByNumber(
  orderNumber: string,
): Promise<CustomerOrder | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_ITEMS)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) throw new Error(`Failed to load order: ${error.message}`);
  return (data as unknown as CustomerOrder) ?? null;
}
