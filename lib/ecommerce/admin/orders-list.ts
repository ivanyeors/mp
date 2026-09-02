import { sumOrderItemQuantities } from "@/lib/ecommerce/orders";
import {
  applyOrdersPaidAtRange,
  parseOrdersPaidAtRange,
} from "@/lib/ecommerce/orders-paid-at-range";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Raw (unparsed) query values for the admin orders list, exactly as they arrive
 * on `/api/shop/orders`. Parsing lives in {@link listAdminOrders} so the route
 * handler and the RSC page share one implementation.
 */
export interface AdminOrdersListParams {
  status?: string | null;
  email?: string | null;
  customer_id?: string | null;
  search?: string | null;
  page?: string | null;
  limit?: string | null;
  sort?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

export interface AdminOrderRow extends Record<string, unknown> {
  id: string;
  items_count: number;
  margin: { gross_margin: number; margin_pct: number | null } | null;
}

export interface AdminOrdersListPayload {
  ok: true;
  rows: AdminOrderRow[];
  total: number;
  page: number;
  limit: number;
}

export type AdminOrdersListResult =
  | { status: 200; body: AdminOrdersListPayload }
  | { status: 400 | 500; body: { error: string } };

/**
 * Assembles the `/api/shop/orders` GET payload. Returns the JSON body plus the
 * status the route should answer with, so the RSC page can consume the same
 * data without an HTTP round trip.
 */
export async function listAdminOrders(
  params: AdminOrdersListParams = {},
): Promise<AdminOrdersListResult> {
  const status = params.status ?? null;
  const email = params.email ?? null;
  const customer_id = params.customer_id ?? null;
  const search = params.search ?? null;
  const page = parseInt(params.page ?? "1", 10);
  const limit = Math.min(parseInt(params.limit ?? "20", 10), 100);
  const sort = params.sort ?? "created_at.desc";
  const paidAtRange = parseOrdersPaidAtRange(
    params.date_from ?? null,
    params.date_to ?? null,
  );
  if (!paidAtRange.ok) {
    return { status: 400, body: { error: paidAtRange.error } };
  }

  const admin = supabaseAdmin();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = admin
    .from("orders")
    .select("*, order_items(quantity)", { count: "estimated" });

  if (status) query = query.eq("status", status);
  if (email) query = query.ilike("email", `%${email}%`);
  if (customer_id) query = query.eq("customer_id", customer_id);
  if (search) {
    query = query.or(`order_number.ilike.%${search}%,email.ilike.%${search}%`);
  }
  query = applyOrdersPaidAtRange(query, paidAtRange.range);

  const [sortColumn, sortDir] = sort.split(".");
  const ascending = sortDir === "asc";
  query = query.order(sortColumn ?? "created_at", { ascending });

  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) return { status: 500, body: { error: error.message } };

  const orderIds = (data ?? []).map((row: { id: string }) => row.id);
  const marginByOrder = new Map<string, { gross_margin: number; margin_pct: number | null }>();
  if (orderIds.length > 0) {
    const { data: margins, error: marginError } = await admin
      .from("order_margins")
      .select("order_id, gross_margin, margin_pct")
      .in("order_id", orderIds);
    if (marginError) return { status: 500, body: { error: marginError.message } };
    for (const m of margins ?? []) {
      marginByOrder.set(m.order_id, {
        gross_margin: m.gross_margin,
        margin_pct: m.margin_pct,
      });
    }
  }

  const rows = (data ?? []).map(
    (row: Record<string, unknown> & { order_items?: unknown; id: string }) => {
      const items = Array.isArray(row.order_items) ? row.order_items : [];
      const rest = { ...row };
      delete (rest as { order_items?: unknown }).order_items;
      return {
        ...rest,
        items_count: sumOrderItemQuantities(items),
        margin: marginByOrder.get(row.id) ?? null,
      };
    },
  ) as AdminOrderRow[];

  return {
    status: 200,
    body: { ok: true, rows, total: count ?? 0, page, limit },
  };
}
