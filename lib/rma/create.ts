import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateEligibility, type EligibilityOrder } from "./eligibility";
import { RMA_TERMINAL_STATUSES, type RmaResolution } from "./transitions";

export interface PlanItemInput {
  order_item_id: string;
  quantity: number;
}

export interface PlanOrderItem {
  id: string;
  quantity: number;
  product_title: string;
  kind?: string | null;
}

export interface PlanRmaInput {
  order: EligibilityOrder;
  orderItems: PlanOrderItem[];
  alreadyReturnedByItem: Record<string, number>;
  requestedItems: PlanItemInput[];
  resolution: RmaResolution;
  returnWindowDays: number;
  now: Date;
}

export interface PlannedRmaRows {
  items: Array<{ order_item_id: string; quantity: number }>;
  emailItems: Array<{ title: string; quantity: number }>;
}

export type PlanRmaResult =
  | { ok: true; rows: PlannedRmaRows }
  | { ok: false; reason: string };

export function planRmaCreate(input: PlanRmaInput): PlanRmaResult {
  const {
    order,
    orderItems,
    alreadyReturnedByItem,
    requestedItems,
    returnWindowDays,
    now,
  } = input;

  if (requestedItems.length === 0) {
    return { ok: false, reason: "Select at least one item to return." };
  }

  const byId = new Map(orderItems.map((i) => [i.id, i]));
  const rows: PlannedRmaRows["items"] = [];
  const emailItems: PlannedRmaRows["emailItems"] = [];
  const seen = new Set<string>();

  for (const req of requestedItems) {
    if (seen.has(req.order_item_id)) {
      return { ok: false, reason: "Duplicate item in request." };
    }
    seen.add(req.order_item_id);

    const item = byId.get(req.order_item_id);
    if (!item) {
      return { ok: false, reason: "One or more items are not part of this order." };
    }

    const result = evaluateEligibility({
      order,
      item: { quantity: item.quantity, kind: item.kind },
      alreadyReturnedQty: alreadyReturnedByItem[item.id] ?? 0,
      requestedQty: req.quantity,
      returnWindowDays,
      now,
    });
    if (!result.eligible) {
      return { ok: false, reason: result.reason ?? "This item cannot be returned." };
    }

    rows.push({ order_item_id: item.id, quantity: req.quantity });
    emailItems.push({ title: item.product_title, quantity: req.quantity });
  }

  return { ok: true, rows: { items: rows, emailItems } };
}

export interface CreateRmaInput {
  orderId: string;
  customerId: string;
  resolution: RmaResolution;
  reason?: string | null;
  customerNote?: string | null;
  photoUrls?: string[];
  items: Array<{ order_item_id: string; quantity: number }>;
}

export interface CreatedRma {
  id: string;
  status: string;
  resolution: RmaResolution;
  created_at: string;
}

export async function createRmaRequest(
  admin: SupabaseClient,
  input: CreateRmaInput,
): Promise<CreatedRma> {
  const { data: request, error: reqErr } = await admin
    .from("rma_requests")
    .insert({
      order_id: input.orderId,
      customer_id: input.customerId,
      resolution: input.resolution,
      status: "requested",
      reason: input.reason ?? null,
      customer_note: input.customerNote ?? null,
      photo_urls: input.photoUrls ?? [],
    })
    .select("id, status, resolution, created_at")
    .single();

  if (reqErr || !request) {
    throw new Error(`Failed to create RMA request: ${reqErr?.message ?? "unknown error"}`);
  }

  const { error: itemsErr } = await admin.from("rma_request_items").insert(
    input.items.map((i) => ({
      rma_request_id: request.id,
      order_item_id: i.order_item_id,
      quantity: i.quantity,
    })),
  );
  if (itemsErr) {
    throw new Error(`Failed to create RMA items: ${itemsErr.message}`);
  }

  const { error: eventErr } = await admin.from("rma_status_events").insert({
    rma_request_id: request.id,
    from_status: null,
    to_status: "requested",
    actor: "system",
    reason: "Customer submitted return request.",
  });
  if (eventErr) {
    throw new Error(`Failed to create RMA status event: ${eventErr.message}`);
  }

  return request as CreatedRma;
}

export async function openReturnedQtyByOrder(
  admin: SupabaseClient,
  orderId: string,
): Promise<Record<string, number>> {
  const { data, error } = await admin
    .from("rma_request_items")
    .select("order_item_id, quantity, rma_requests!inner(order_id, status)")
    .eq("rma_requests.order_id", orderId);

  if (error) {
    throw new Error(`Failed to load existing returns: ${error.message}`);
  }

  const terminal = new Set<string>(RMA_TERMINAL_STATUSES);
  const totals: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{
    order_item_id: string;
    quantity: number;
    rma_requests: { status: string } | { status: string }[];
  }>) {
    const joined = Array.isArray(row.rma_requests) ? row.rma_requests[0] : row.rma_requests;
    if (!joined || terminal.has(joined.status)) continue;
    totals[row.order_item_id] = (totals[row.order_item_id] ?? 0) + row.quantity;
  }
  return totals;
}
