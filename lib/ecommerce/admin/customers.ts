import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Admin customer reads shared by `GET /api/shop/customers`,
 * `GET /api/shop/customers/[id]` and the RSC settings pages that render the
 * same data on the server instead of fetching it after hydration.
 *
 * Callers are responsible for authorisation (`requireAdmin("customers")` in a
 * route handler, `requireAdminPage("customers", locale)` in a page).
 */

export interface AdminCustomersListPayload {
  ok: true;
  rows: unknown[];
  total: number;
  page: number;
  limit: number;
}

export type AdminCustomersListResult =
  | AdminCustomersListPayload
  | { ok: false; error: string };

export async function listAdminCustomers(
  searchParams: URLSearchParams,
): Promise<AdminCustomersListResult> {
  const search = searchParams.get("search");
  const tags = searchParams.get("tags");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);
  const sort = searchParams.get("sort") ?? "newest";

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("customers").select("*", { count: "exact" });

  if (search) {
    query = query.or(`email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`);
  }

  if (tags) {
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    if (tagList.length > 0) {
      query = query.overlaps("tags", tagList);
    }
  }

  switch (sort) {
    case "name-asc":
      query = query.order("first_name", { ascending: true }).order("last_name", { ascending: true });
      break;
    case "name-desc":
      query = query.order("first_name", { ascending: false }).order("last_name", { ascending: false });
      break;
    case "oldest":
      query = query.order("created_at", { ascending: true });
      break;
    default:
      query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return { ok: false, error: error.message };

  return { ok: true, rows: data ?? [], total: count ?? 0, page, limit };
}

export interface AdminCustomerPayload {
  ok: true;
  row: unknown;
}

export type AdminCustomerResult = AdminCustomerPayload | { ok: false; error: string };

export async function getAdminCustomer(id: string): Promise<AdminCustomerResult> {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("customers")
    .select("*, customer_addresses(*)")
    .eq("id", id)
    .single();

  if (error) return { ok: false, error: "Customer not found" };
  return { ok: true, row: data };
}
