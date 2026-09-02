import { z } from "zod";
import { getLocations, type ResolvedLocation } from "@/lib/locations";
import { supabaseAdmin } from "@/lib/supabase/server";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface MpConfigResponseListRow extends Record<string, unknown> {
  id: string;
  order_id: string | null;
  order_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface MpConfigResponsesListPayload {
  ok: true;
  rows: MpConfigResponseListRow[];
  locations: ResolvedLocation[];
  count: number | null;
  limit: number;
  offset: number;
}

export type MpConfigResponsesListResult =
  | { status: 200; body: MpConfigResponsesListPayload }
  | { status: 400; body: { error: unknown } }
  | { status: 500; body: { error: string } };

/**
 * Assembles the `/api/mp-config/responses` GET payload (list + location
 * options + estimated count) so the route handler and the RSC results page
 * share one implementation. `limit`/`offset` arrive as raw strings, exactly as
 * the route reads them off the query string.
 */
export async function listMpConfigResponses(params: {
  limit?: string | null;
  offset?: string | null;
} = {}): Promise<MpConfigResponsesListResult> {
  const parsedQuery = ListQuerySchema.safeParse({
    limit: params.limit ?? "50",
    offset: params.offset ?? "0",
  });
  if (!parsedQuery.success) {
    return { status: 400, body: { error: parsedQuery.error.flatten() } };
  }

  const { limit, offset } = parsedQuery.data;
  const admin = supabaseAdmin();
  // Location dropdown options + labels (own + partner) are independent of the
  // list query, so both run concurrently.
  const [listResult, locations] = await Promise.all([
    admin
      .from("mp_config_responses")
      .select("id,data,is_final,measured_by_type,measured_by_staff_id,source,location_id,order_id,created_at,updated_at,status,suggested_size,suggested_tier,assigned_size,assigned_tier,customer_email", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1),
    getLocations(),
  ]);
  const { data, error, count } = listResult;

  // Fetch order numbers for linked responses
  const orderIds = (data ?? []).map((r) => r.order_id).filter(Boolean) as string[];
  let orderNumberMap = new Map<string, string>();
  if (orderIds.length > 0) {
    const { data: orders } = await admin
      .from("orders")
      .select("id, order_number")
      .in("id", orderIds);
    orderNumberMap = new Map((orders ?? []).map((o) => [o.id, o.order_number]));
  }

  const rows = (data ?? []).map((r) => ({
    ...r,
    order_number: r.order_id ? orderNumberMap.get(r.order_id) ?? null : null,
  })) as MpConfigResponseListRow[];

  if (error) return { status: 500, body: { error: error.message } };

  return {
    status: 200,
    body: {
      ok: true,
      rows,
      locations,
      count: typeof count === "number" ? count : null,
      limit,
      offset,
    },
  };
}
