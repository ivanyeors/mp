import { supabaseAdmin } from "@/lib/supabase/server";

export interface AdminOrderDetailPayload {
  ok: true;
  row: Record<string, unknown> & { items: unknown[]; timeline: unknown[] };
  margin: Record<string, unknown> | null;
}

export type AdminOrderDetailResult =
  | { status: 200; body: AdminOrderDetailPayload }
  | { status: 404; body: { error: string } };

/** Assembles the `/api/shop/orders/[id]` GET payload (order + items + timeline + margin). */
export async function loadAdminOrderDetail(id: string): Promise<AdminOrderDetailResult> {
  const admin = supabaseAdmin();

  const [{ data, error }, { data: margin }] = await Promise.all([
    admin
      .from("orders")
      .select("*, order_items(*), order_timeline(*)")
      .eq("id", id)
      .single(),
    admin.from("order_margins").select("*").eq("order_id", id).maybeSingle(),
  ]);

  if (error) return { status: 404, body: { error: "Order not found" } };

  const orderItems = Array.isArray(data.order_items) ? data.order_items : [];
  const timeline = Array.isArray(data.order_timeline)
    ? [...data.order_timeline].sort(
        (a: { created_at: string }, b: { created_at: string }) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
    : [];
  const orderFields = { ...data };
  delete (orderFields as { order_items?: unknown }).order_items;
  delete (orderFields as { order_timeline?: unknown }).order_timeline;

  return {
    status: 200,
    body: {
      ok: true,
      row: { ...orderFields, items: orderItems, timeline },
      margin: margin ?? null,
    },
  };
}

export type AdminOrderTimelineResult =
  | { status: 200; body: { ok: true; rows: unknown[]; events: unknown[] } }
  | { status: 500; body: { error: string } };

/** Assembles the `/api/shop/orders/[id]/timeline` GET payload. */
export async function loadAdminOrderTimeline(
  id: string,
): Promise<AdminOrderTimelineResult> {
  const admin = supabaseAdmin();

  const { data, error } = await admin
    .from("order_timeline")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  if (error) return { status: 500, body: { error: error.message } };

  return { status: 200, body: { ok: true, rows: data ?? [], events: data ?? [] } };
}

export interface AdminOrderMpConfigLink {
  id: string;
  data: Record<string, unknown> | null;
  is_final: boolean;
  source: string;
  order_item_id: string | null;
  created_at: string;
}

export type AdminOrderMpConfigLinksResult =
  | { status: 200; body: { ok: true; responses: AdminOrderMpConfigLink[] } }
  | { status: 500; body: { error: string } };

/** Assembles the `/api/shop/orders/[id]/mp-config-link` GET payload. */
export async function loadAdminOrderMpConfigLinks(
  id: string,
): Promise<AdminOrderMpConfigLinksResult> {
  const admin = supabaseAdmin();
  const { data, error } = await admin
    .from("mp_config_responses")
    .select("id, data, is_final, source, order_item_id, created_at")
    .eq("order_id", id)
    .order("created_at", { ascending: true });

  if (error) return { status: 500, body: { error: error.message } };

  return {
    status: 200,
    body: { ok: true, responses: (data ?? []) as AdminOrderMpConfigLink[] },
  };
}
