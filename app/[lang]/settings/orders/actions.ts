"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/server";
import { validateSession, SETTINGS_SESSION_COOKIE } from "@/lib/settings-auth";
import { cookies } from "next/headers";

async function requireAuth() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SETTINGS_SESSION_COOKIE)?.value;
  const result = validateSession(token);
  if (!result.valid) throw new Error("Unauthorized");
}

export async function updateOrderStatus(
  orderId: string,
  status: string,
) {
  await requireAuth();
  const admin = supabaseAdmin();

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
  revalidatePath("/settings/orders");
  return { ok: true, row: data };
}

export async function fulfillOrder(
  orderId: string,
  trackingNumber?: string,
  trackingUrl?: string,
) {
  await requireAuth();
  const admin = supabaseAdmin();
  const now = new Date().toISOString();

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
