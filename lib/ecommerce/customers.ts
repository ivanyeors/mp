import { supabaseAdmin } from "@/lib/supabase/server";
import type { Customer } from "@/lib/types/ecommerce";

export async function findOrCreateCustomer(email: string, extra?: { first_name?: string; last_name?: string; phone?: string; locale?: string }): Promise<Customer> {
  const admin = supabaseAdmin();
  const normalized = email.toLowerCase().trim();

  // Try to find existing
  const { data: existing } = await admin
    .from("customers")
    .select("*")
    .ilike("email", normalized)
    .single();

  if (existing) return existing as Customer;

  // Create new
  const { data: created, error } = await admin
    .from("customers")
    .insert({ email: normalized, ...extra })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create customer: ${error.message}`);
  return created as Customer;
}

export async function getCustomerById(id: string): Promise<Customer | null> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("customers")
    .select("*, customer_addresses(*)")
    .eq("id", id)
    .single();

  if (error) return null;
  return { ...data, addresses: data.customer_addresses ?? [] } as Customer;
}

export async function getCustomers(opts: { search?: string; page?: number; limit?: number } = {}) {
  const admin = supabaseAdmin();
  const page = opts.page ?? 1;
  const limit = Math.min(opts.limit ?? 20, 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("customers").select("*", { count: "exact" });

  if (opts.search) {
    query = query.or(`email.ilike.%${opts.search}%,first_name.ilike.%${opts.search}%,last_name.ilike.%${opts.search}%`);
  }

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { customers: (data ?? []) as Customer[], total: count ?? 0, page, limit };
}

export async function updateCustomerStats(customerId: string) {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("orders")
    .select("total")
    .eq("customer_id", customerId)
    .in("status", ["confirmed", "processing", "shipped", "delivered", "partially_refunded"]);

  const orders = data ?? [];
  const totalOrders = orders.length;
  const totalSpent = orders.reduce((sum: number, o: { total: number }) => sum + Number(o.total), 0);

  await admin
    .from("customers")
    .update({ total_orders: totalOrders, total_spent: totalSpent })
    .eq("id", customerId);
}
