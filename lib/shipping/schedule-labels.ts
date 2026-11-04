import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Courier-label work that follows a payment or a refund (ADR 0044). It runs once
 * the response has gone, so Stripe and the customer are answered first and a slow
 * courier never holds them up. Outside a request (a script, a unit test) there is
 * no "after", and nothing runs: Staff make or cancel the label by hand.
 */
function afterResponse(what: string, task: () => Promise<void>): void {
  try {
    after(task);
  } catch (err) {
    console.warn(`[labels] ${what} not scheduled:`, err instanceof Error ? err.message : err);
  }
}

/** Make a just-paid order's label, on the customer's courier. */
export function scheduleAutoLabel(admin: SupabaseClient, orderId: string): void {
  afterResponse(`Label for ${orderId}`, async () => {
    const { autoCreateOrderLabelSafely } = await import("@/lib/shipping/auto-label");
    await autoCreateOrderLabelSafely(admin, orderId);
  });
}

/** Cancel a fully refunded order's label while the courier has not collected it. */
export function scheduleLabelCancel(admin: SupabaseClient, orderId: string): void {
  afterResponse(`Label cancel for ${orderId}`, async () => {
    const { cancelOrderLabel } = await import("@/lib/shipping/order-shipment");
    await cancelOrderLabel(admin, orderId);
  });
}
