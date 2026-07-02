import { supabaseAdmin } from "@/lib/supabase/server";
import type { Order, OrderItem, OrderTimelineEvent } from "@/lib/types/ecommerce";

/** Sum line quantities for list/detail item counts (not line-item row count). */
export function sumOrderItemQuantities(
  items: ReadonlyArray<{ quantity?: number | null }> | null | undefined
): number {
  return (items ?? []).reduce((sum, item) => sum + (item.quantity ?? 0), 0);
}

export interface GetOrdersOpts {
  status?: string;
  email?: string;
  customer_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function getOrders(opts: GetOrdersOpts = {}) {
  const admin = supabaseAdmin();
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("orders").select("*, order_items(*)", { count: "exact" });

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.email) query = query.ilike("email", `%${opts.email}%`);
  if (opts.customer_id) query = query.eq("customer_id", opts.customer_id);
  if (opts.search) {
    query = query.or(`order_number.ilike.%${opts.search}%,email.ilike.%${opts.search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  return {
    orders: (data ?? []).map((o: Order & { order_items: OrderItem[] }) => {
      const items = o.order_items ?? [];
      return {
        ...o,
        items,
        items_count: sumOrderItemQuantities(items),
      };
    }),
    total: count ?? 0,
    page,
    limit,
  };
}

export async function getOrderById(id: string): Promise<Order | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*), order_timeline(*), customers(*)")
    .eq("id", id)
    .single();

  if (error) return null;
  return {
    ...data,
    items: (data.order_items ?? []) as OrderItem[],
    timeline: ((data.order_timeline ?? []) as OrderTimelineEvent[]).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    ),
    customer: data.customers ?? null,
  } as Order;
}

export async function getOrderByStripeSession(sessionId: string): Promise<Order | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("orders")
    .select("*, order_items(*)")
    .eq("stripe_session_id", sessionId)
    .single();

  if (error) return null;
  return { ...data, items: data.order_items ?? [] } as Order;
}

export async function addOrderTimelineEvent(orderId: string, eventType: string, message: string, metadata?: Record<string, unknown>) {
  const admin = supabaseAdmin();
  const { error } = await admin.from("order_timeline").insert({
    order_id: orderId,
    event_type: eventType,
    message,
    metadata: metadata ?? {},
  });
  if (error) throw new Error(error.message);
}

export async function getOrderDashboardStats() {
  const admin = supabaseAdmin();

  const [
    { count: totalOrders },
    { data: revenueData },
    { count: pendingOrders },
  ] = await Promise.all([
    admin.from("orders").select("*", { count: "exact", head: true }),
    admin.from("orders").select("total").in("status", ["confirmed", "processing", "shipped", "delivered"]),
    admin.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  const revenue = (revenueData ?? []).reduce((sum: number, o: { total: number }) => sum + Number(o.total), 0);
  const confirmedOrders = (revenueData ?? []).length;

  return {
    totalOrders: totalOrders ?? 0,
    revenue,
    averageOrderValue: confirmedOrders > 0 ? revenue / confirmedOrders : 0,
    pendingOrders: pendingOrders ?? 0,
  };
}
