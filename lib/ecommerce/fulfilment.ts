import type { SupabaseClient } from "@supabase/supabase-js";
import { sendShippingEmail } from "@/lib/email";
import { deductStockWhenSold } from "./order-stock";

export interface MarkShippedInput {
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  /** Extra order columns written in the same update (courier, label, carrier cost). */
  extra?: Record<string, unknown>;
  /** Timeline line; defaults to the manual-fulfilment wording. */
  message?: string;
  metadata?: Record<string, unknown>;
}

export type FulfilmentResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; status: number; error: string };

/**
 * Mark an order shipped: status, shipped_at, tracking, a timeline event and the
 * shipping email. The one path for both "Mark as Shipped" in Settings → Orders and
 * an Easyship label, so the customer gets the same email either way. The email is
 * idempotent per order, so a webhook that repeats a label event sends nothing new.
 */
export async function markOrderShipped(
  admin: SupabaseClient,
  orderId: string,
  input: MarkShippedInput,
): Promise<FulfilmentResult> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { ...input.extra, status: "shipped", shipped_at: now };
  if (input.trackingNumber) update.tracking_number = input.trackingNumber;
  if (input.trackingUrl) update.tracking_url = input.trackingUrl;

  const { data: before } = await admin.from("orders").select("status").eq("id", orderId).maybeSingle();
  const { data, error } = await admin.from("orders").update(update).eq("id", orderId).select("*").single();
  if (error || !data) {
    const notFound = !data || /not found|no rows/i.test(error?.message ?? "");
    return notFound
      ? { ok: false, status: 404, error: "Order not found" }
      : { ok: false, status: 500, error: error!.message };
  }
  // Shipping an Order nobody confirmed still sends its goods out.
  await deductStockWhenSold(admin, orderId, before?.status, "shipped");

  const message =
    input.message ??
    (input.trackingNumber
      ? `Order shipped. Tracking: ${input.trackingNumber}${input.trackingUrl ? ` — ${input.trackingUrl}` : ""}`
      : "Order marked as shipped.");

  await admin.from("order_timeline").insert({
    order_id: orderId,
    event_type: "order_shipped",
    message,
    metadata: {
      tracking_number: input.trackingNumber ?? null,
      tracking_url: input.trackingUrl ?? null,
      shipped_at: now,
      ...input.metadata,
    },
  });

  // Non-critical: a failed email must never undo or block fulfilment.
  try {
    await sendShippingEmail(orderId, data, admin);
  } catch (err) {
    console.error(`[fulfilment] Shipping email failed for ${orderId}:`, err);
  }

  return { ok: true, row: data as Record<string, unknown> };
}

/**
 * Mark an order shipped from the courier's first scan of its parcel (ADR 0044):
 * the label was made when the order was paid, and the parcel left only now. The
 * order is claimed on `shipped_at`, so the status and checkpoint events Easyship
 * sends for the same scan ship it, and email the customer, once. False when it
 * was already shipped, or is no longer an order that ships.
 */
export async function markOrderShippedByCourier(
  admin: SupabaseClient,
  orderId: string,
  input: {
    courierStatus: string;
    courierName?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
    shipmentId: string;
  },
): Promise<boolean> {
  const { data: claimed, error } = await admin
    .from("orders")
    .update({ shipped_at: new Date().toISOString() })
    .eq("id", orderId)
    .in("status", ["confirmed", "processing"])
    .is("shipped_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!claimed?.length) return false;

  const result = await markOrderShipped(admin, orderId, {
    trackingNumber: input.trackingNumber,
    trackingUrl: input.trackingUrl,
    extra: { shipping_tracking_status: input.courierStatus },
    message: `Collected by ${input.courierName ?? "the courier"}${
      input.trackingNumber ? `. Tracking: ${input.trackingNumber}` : ""
    }`,
    metadata: { source: "easyship", easyship_shipment_id: input.shipmentId, courier_status: input.courierStatus },
  });
  if (!result.ok) {
    // markOrderShipped fails only when its update did not land: let the retry claim it again.
    await admin.from("orders").update({ shipped_at: null }).eq("id", orderId);
    throw new Error(result.error);
  }
  return true;
}

/**
 * Mark an order delivered from a courier event. `delivered_at` anchors the RMA
 * return window and commission release, so it is written once and never moved:
 * an order already delivered (or cancelled/refunded) is left alone.
 */
export async function markOrderDeliveredByCourier(
  admin: SupabaseClient,
  orderId: string,
  courierStatus: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("orders")
    .update({ status: "delivered", delivered_at: now, shipping_tracking_status: courierStatus })
    .eq("id", orderId)
    .in("status", ["confirmed", "processing", "shipped"])
    .is("delivered_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data?.length) return false;

  await admin.from("order_timeline").insert({
    order_id: orderId,
    event_type: "order_delivered",
    message: "Delivered — confirmed by the courier via Easyship.",
    metadata: { delivered_at: now, source: "easyship", courier_status: courierStatus },
  });
  return true;
}
