import { supabaseAdmin } from "@/lib/supabase/server";
import { applyCustomerFilters, parseCustomerFilters, type CustomerListQuery } from "@/lib/crm/customer-filters";
import { CUSTOMER_OVERVIEW_SELECT, type CustomerOverviewRow } from "@/lib/crm/customer-overview";

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
  rows: CustomerOverviewRow[];
  total: number;
  page: number;
  limit: number;
}

export type AdminCustomersListResult =
  | AdminCustomersListPayload
  | { ok: false; error: string };

/**
 * One page of the Customer overview (`admin_customer_overview`, migration
 * slice 12), filtered and sorted from the list's URL parameters
 * (lib/crm/customer-filters.ts). An invalid parameter is dropped there.
 */
export async function listAdminCustomers(
  searchParams: URLSearchParams,
): Promise<AdminCustomersListResult> {
  const { filters } = parseCustomerFilters(searchParams);
  const { page, limit } = filters;

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // Seen through the methods the mapping uses: checking Supabase's builder
  // against the interface structurally is too deep for the compiler.
  const base = admin
    .from("admin_customer_overview")
    .select(CUSTOMER_OVERVIEW_SELECT, { count: "exact" }) as unknown as OverviewQuery;

  const { data, error, count } = await applyCustomerFilters(base, filters).range(from, to);
  if (error) return { ok: false, error: error.message };

  return { ok: true, rows: data ?? [], total: count ?? 0, page, limit };
}

type OverviewQuery = CustomerListQuery & {
  range(
    from: number,
    to: number,
  ): PromiseLike<{ data: CustomerOverviewRow[] | null; error: { message: string } | null; count: number | null }>;
};

export interface AdminCustomerPayload {
  ok: true;
  row: unknown;
}

export type AdminCustomerResult = AdminCustomerPayload | { ok: false; error: string };

/**
 * One Customer for the detail page, read from `customers` itself rather than
 * the overview: the Account card reads `auth_user_id`, `account_linked_at` and
 * `account_last_seen_at` from this row.
 */
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
