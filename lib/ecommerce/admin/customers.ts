import { supabaseAdmin } from "@/lib/supabase/server";
import {
  applyCustomerFilters,
  parseCustomerFilters,
  type CustomerFilters,
  type CustomerListQuery,
} from "@/lib/crm/customer-filters";
import { CUSTOMER_OVERVIEW_SELECT, type CustomerOverviewColumn, type CustomerOverviewRow } from "@/lib/crm/customer-overview";

export interface AdminCustomersListPayload {
  ok: true;
  rows: CustomerOverviewRow[];
  total: number;
  page: number;
  limit: number;
  shipsToUnknown: number | null;
}

export type AdminCustomersListResult =
  | AdminCustomersListPayload
  | { ok: false; error: string };

export async function listAdminCustomers(
  searchParams: URLSearchParams,
): Promise<AdminCustomersListResult> {
  const { filters } = parseCustomerFilters(searchParams);
  const { page, limit } = filters;

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

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

export const CUSTOMER_LIFECYCLE_COLUMNS = [
  "purchases",
  "last_purchase_at",
  "attended_bookings",
  "last_readjusted_at",
  "lifecycle_stage",
  "lifecycle_detail",
  "lifecycle_undated",
  "marketing_email_updated_at",
  "unengaged",
  "last_purchase_dated_by_fitting",
] as const satisfies readonly CustomerOverviewColumn[];

export type AdminCustomerLifecycle = Pick<CustomerOverviewRow, (typeof CUSTOMER_LIFECYCLE_COLUMNS)[number]>;

export async function getAdminCustomerLifecycle(id: string): Promise<AdminCustomerLifecycle | null> {
  const { data, error } = await supabaseAdmin()
    .from("admin_customer_overview")
    .select(CUSTOMER_LIFECYCLE_COLUMNS.join(", "))
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as AdminCustomerLifecycle;
}
