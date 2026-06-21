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

const ORDER_WITH_ITEMS = "*, items:order_items(*)";

/** All of the signed-in customer's orders, most recent first. */
export async function getCustomerOrders(): Promise<Order[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_ITEMS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return (data ?? []) as unknown as Order[];
}

/**
 * A single order (with items) by order number, scoped to the signed-in customer
 * via RLS. Returns null when no matching order is visible to this customer.
 */
export async function getCustomerOrderByNumber(
  orderNumber: string,
): Promise<Order | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_ITEMS)
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error) throw new Error(`Failed to load order: ${error.message}`);
  return (data as unknown as Order) ?? null;
}
