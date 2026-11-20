import { createSupabaseServerClient } from "@/lib/supabase/ssr-server";
import type { Order } from "@/lib/types/ecommerce";

export const CUSTOMER_ORDER_COLUMNS = [
  "id", "order_number", "customer_id", "email", "phone", "status", "currency",
  "subtotal", "shipping_amount", "tax_amount", "discount_amount", "total",
  "amount_captured", "amount_refunded", "points_spent", "points_discount",
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

export type CustomerOrder = Omit<Order, "internal_notes">;

export async function getCustomerOrders(): Promise<CustomerOrder[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_WITH_ITEMS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to load orders: ${error.message}`);
  return (data ?? []) as unknown as CustomerOrder[];
}

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
