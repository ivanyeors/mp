import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

function afterResponse(what: string, task: () => Promise<void>): void {
  try {
    after(task);
  } catch (err) {
    console.warn(`[labels] ${what} not scheduled:`, err instanceof Error ? err.message : err);
  }
}

export function scheduleAutoLabel(admin: SupabaseClient, orderId: string): void {
  afterResponse(`Label for ${orderId}`, async () => {
    const { autoCreateOrderLabelSafely } = await import("@/lib/shipping/auto-label");
    await autoCreateOrderLabelSafely(admin, orderId);
  });
}

export function scheduleLabelCancel(admin: SupabaseClient, orderId: string): void {
  afterResponse(`Label cancel for ${orderId}`, async () => {
    const { cancelOrderLabel } = await import("@/lib/shipping/order-shipment");
    await cancelOrderLabel(admin, orderId);
  });
}
