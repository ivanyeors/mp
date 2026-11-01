import { supabaseAdmin } from "@/lib/supabase/server";
import {
  applyCustomerFilters,
  parseCustomerFilters,
  type CustomerFilters,
  type CustomerListQuery,
} from "@/lib/crm/customer-filters";
import { CUSTOMER_OVERVIEW_SELECT, type CustomerOverviewColumn, type CustomerOverviewRow } from "@/lib/crm/customer-overview";

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
  /**
   * With *Ships to Singapore* or *outside Singapore* (PRD-campaign-audiences
   * slice 05): how many more match every other filter but ship to an unknown
   * country, so the list says who it leaves out. Null otherwise, or when that
   * count could not be read.
   */
  shipsToUnknown: number | null;
}

export type AdminCustomersListResult =
  | AdminCustomersListPayload
  | { ok: false; error: string };

/**
 * One page of the Customer overview (`admin_customer_overview`, migration
 * slice 12), filtered and sorted from the list's URL parameters
 * (lib/crm/customer-filters.ts). An invalid parameter is dropped there, and
 * search is one escaped `ilike` on `search_text`, never an `.or()` (CRM
 * slice 04; ADR 0028 (d)).
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

  const [list, shipsToUnknown] = await Promise.all([
    applyCustomerFilters(base, filters).range(from, to),
    countShipsToUnknown(admin, filters),
  ]);
  const { data, error, count } = list;
  if (error) return { ok: false, error: error.message };

  return { ok: true, rows: data ?? [], total: count ?? 0, page, limit, shipsToUnknown };
}

type CountQuery = CustomerListQuery & PromiseLike<{ count: number | null; error: { message: string } | null }>;

/** The same filters with *Ships to: unknown*, counted; null without a known-country filter, or on a failed read. */
async function countShipsToUnknown(
  admin: ReturnType<typeof supabaseAdmin>,
  filters: CustomerFilters,
): Promise<number | null> {
  if (filters.ships_to !== "sg" && filters.ships_to !== "not-sg") return null;
  const head = admin.from("admin_customer_overview").select("id", { count: "exact", head: true }) as unknown as CountQuery;
  const { count, error } = await applyCustomerFilters(head, { ...filters, ships_to: "unknown" }, { order: false });
  return error ? null : (count ?? 0);
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

/**
 * What the detail page reads for the **Lifecycle stage** (PRD-crm-retention-loop
 * slice 03): the stage and the facts it is read from. The type is this list,
 * so dropping a column the page shows fails to compile there.
 */
export const CUSTOMER_LIFECYCLE_COLUMNS = [
  "purchases",
  "last_purchase_at",
  "attended_bookings",
  "last_readjusted_at",
  "lifecycle_stage",
  "lifecycle_detail",
  "lifecycle_undated",
  "marketing_email_updated_at",
  // PRD-campaign-audiences slice 12: the sunset rule, beside the stage.
  "unengaged",
] as const satisfies readonly CustomerOverviewColumn[];

/** The Customer's **Lifecycle stage** and what it is read from. */
export type AdminCustomerLifecycle = Pick<CustomerOverviewRow, (typeof CUSTOMER_LIFECYCLE_COLUMNS)[number]>;

/**
 * One Customer's stage, from the overview, for the detail page. Null when it
 * cannot be read: the stage is a summary, never a reason to fail the page.
 */
export async function getAdminCustomerLifecycle(id: string): Promise<AdminCustomerLifecycle | null> {
  const { data, error } = await supabaseAdmin()
    .from("admin_customer_overview")
    .select(CUSTOMER_LIFECYCLE_COLUMNS.join(", "))
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  // A joined column list is a plain string to the client's types, so the row is typed here.
  return data as unknown as AdminCustomerLifecycle;
}
