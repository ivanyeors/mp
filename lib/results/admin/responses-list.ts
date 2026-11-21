import { z } from "zod";
import { getLocations, type ResolvedLocation } from "@/lib/locations";
import { supabaseAdmin } from "@/lib/supabase/server";

const ListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export interface LinkedOrderSummary {
  id: string;
  order_number: string | null;
  status: string | null;
  total: number | null;
  currency: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  tracking_number: string | null;
  needs_attention: boolean | null;
}

export interface MpConfigResponseListRow extends Record<string, unknown> {
  id: string;
  order_id: string | null;
  order_number: string | null;
  order: LinkedOrderSummary | null;
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
  const [listResult, locations] = await Promise.all([
    admin
      .from("mp_config_responses")
      .select("id,data,is_final,measured_by_type,measured_by_staff_id,source,location_id,order_id,created_at,updated_at,status,suggested_size,suggested_tier,assigned_size,assigned_tier,customer_email,payment_intent_id,topup_paid_at,payment_reminder_count,payment_reminder_last_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1),
    getLocations(),
  ]);
  const { data, error, count } = listResult;

  const orderIds = (data ?? []).map((r) => r.order_id).filter(Boolean) as string[];
  let orderMap = new Map<string, LinkedOrderSummary>();
  if (orderIds.length > 0) {
    const { data: orders } = await admin
      .from("orders")
      .select(
        "id, order_number, status, total, currency, paid_at, shipped_at, delivered_at, tracking_number, needs_attention",
      )
      .in("id", orderIds);
    orderMap = new Map(
      (orders ?? []).map((o) => [
        o.id,
        {
          id: o.id,
          order_number: o.order_number ?? null,
          status: o.status ?? null,
          total: o.total != null ? Number(o.total) : null,
          currency: o.currency ?? null,
          paid_at: o.paid_at ?? null,
          shipped_at: o.shipped_at ?? null,
          delivered_at: o.delivered_at ?? null,
          tracking_number: o.tracking_number ?? null,
          needs_attention: o.needs_attention ?? null,
        } satisfies LinkedOrderSummary,
      ]),
    );
  }

  const rows = (data ?? []).map((r) => {
    const order = r.order_id ? orderMap.get(r.order_id) ?? null : null;
    return {
      ...r,
      order,
      order_number: order?.order_number ?? null,
    };
  }) as MpConfigResponseListRow[];

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
