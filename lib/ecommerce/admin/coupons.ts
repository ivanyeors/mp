import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Admin coupon (discount code) reads shared by `GET /api/shop/coupons`,
 * `GET /api/shop/coupons/[id]` and the RSC settings pages that render the same
 * data on the server instead of fetching it after hydration.
 *
 * Callers are responsible for authorisation (`requireAdmin("discounts")` in a
 * route handler, `requireAdminPage("discounts", locale)` in a page).
 */

export interface AdminCouponsListPayload {
  ok: true;
  rows: unknown[];
  total: number;
  page: number;
  limit: number;
}

export type AdminCouponsListResult =
  | AdminCouponsListPayload
  | { ok: false; error: string };

/**
 * `bound=show` lists account-bound vouchers too (`coupons.customer_id` set,
 * such as each Customer's Welcome-back voucher, ADR 0028 (g)). By default the
 * list holds bearer codes only: one voucher per claimed Customer would bury
 * the codes Staff actually manage (migration slice 06).
 */
export const SHOW_BOUND_COUPONS_PARAM = "bound";

export async function listAdminCoupons(
  searchParams: URLSearchParams,
): Promise<AdminCouponsListResult> {
  const showBound = searchParams.get(SHOW_BOUND_COUPONS_PARAM) === "show";
  const active = searchParams.get("active");
  const page = parseInt(searchParams.get("page") ?? "1", 10);
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), 100);

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin.from("coupons").select("*", { count: "exact" });

  if (!showBound) query = query.is("customer_id", null);
  if (active === "true") query = query.eq("is_active", true);
  if (active === "false") query = query.eq("is_active", false);

  query = query.order("created_at", { ascending: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) return { ok: false, error: error.message };

  return { ok: true, rows: data ?? [], total: count ?? 0, page, limit };
}

export interface AdminCouponPayload {
  ok: true;
  row: unknown;
}

export type AdminCouponResult = AdminCouponPayload | { ok: false; error: string };

export async function getAdminCoupon(id: string): Promise<AdminCouponResult> {
  const admin = supabaseAdmin();

  const { data, error } = await admin.from("coupons").select("*").eq("id", id).single();
  if (error) return { ok: false, error: "Coupon not found" };
  return { ok: true, row: data };
}
