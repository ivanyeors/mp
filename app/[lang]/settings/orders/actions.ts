"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { assertAdmin } from "@/lib/auth/admin";
import { recordAdminAction } from "@/lib/auth/audit";
import { deductStockWhenSold } from "@/lib/ecommerce/order-stock";

function requireAuth() {
  return assertAdmin("orders");
}

const ORDER_AUDIT_FIELDS =
  "id, status, tracking_number, tracking_url, shipped_at, delivered_at, cancelled_at";

export async function updateOrderStatus(
  orderId: string,
  status: string,
) {
  const actor = await requireAuth();
  const admin = supabaseAdmin();

  const { data: before } = await admin
    .from("orders")
    .select(ORDER_AUDIT_FIELDS)
    .eq("id", orderId)
    .maybeSingle();

  const update: Record<string, unknown> = { status };
  if (status === "cancelled") update.cancelled_at = new Date().toISOString();
  if (status === "delivered") update.delivered_at = new Date().toISOString();

  const { data, error } = await admin
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "order.status_change",
    entityType: "order",
    entityId: orderId,
    before,
    after: { status: data.status },
  });

  await deductStockWhenSold(admin, orderId, before?.status, data.status);

  revalidatePath("/settings/orders");
  return { ok: true, row: data };
}

export async function fulfillOrder(
  orderId: string,
  trackingNumber?: string,
  trackingUrl?: string,
) {
  const actor = await requireAuth();
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

  const { data: before } = await admin
    .from("orders")
    .select(ORDER_AUDIT_FIELDS)
    .eq("id", orderId)
    .maybeSingle();

  const update: Record<string, unknown> = { status: "shipped", shipped_at: now };
  if (trackingNumber) update.tracking_number = trackingNumber;
  if (trackingUrl) update.tracking_url = trackingUrl;

  const { data, error } = await admin
    .from("orders")
    .update(update)
    .eq("id", orderId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await recordAdminAction({
    actor,
    action: "order.fulfill",
    entityType: "order",
    entityId: orderId,
    before,
    after: {
      status: data.status,
      tracking_number: data.tracking_number,
      tracking_url: data.tracking_url,
      shipped_at: data.shipped_at,
    },
  });

  await deductStockWhenSold(admin, orderId, before?.status, data.status);

  const timelineMessage = trackingNumber
    ? `Order shipped. Tracking: ${trackingNumber}${trackingUrl ? ` — ${trackingUrl}` : ""}`
    : "Order marked as shipped.";

  await admin.from("order_timeline").insert({
    order_id: orderId,
    event_type: "order_shipped",
    message: timelineMessage,
    metadata: { tracking_number: trackingNumber ?? null, tracking_url: trackingUrl ?? null, shipped_at: now },
  });

  revalidatePath("/settings/orders");
  return { ok: true, row: data };
}
