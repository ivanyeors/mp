/**
 * The daily sweep (ADR 0048): a Staff order whose Payment link expired unpaid
 * is cancelled, so the orders list does not fill with orders nobody will pay.
 * Its open Checkout, if any, is closed first; one Stripe says is complete is
 * left for the webhook, which is about to confirm it. Never throws.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { getStripe } from "@/lib/stripe/client";

export type ExpireSummary = { ok: true; cancelled: number; skipped: number } | { ok: false; error: string };

/** At most this many a day; the rest wait for tomorrow. */
const BATCH = 200;

export async function expireStaffOrderLinks(admin: SupabaseClient, now: Date = new Date()): Promise<ExpireSummary> {
  try {
    const { data: links, error } = await admin
      .from("order_payment_links")
      .select("order_id")
      .lt("expires_at", now.toISOString())
      .order("expires_at", { ascending: true })
      .limit(BATCH);
    if (error) throw new Error(error.message);
    const ids = (links ?? []).map((l) => l.order_id as string);
    if (ids.length === 0) return { ok: true, cancelled: 0, skipped: 0 };

    const { data: orders, error: ordersError } = await admin
      .from("orders")
      .select("id, stripe_session_id")
      .in("id", ids)
      .is("paid_at", null)
      .in("status", ["pending", "payment_failed"]);
    if (ordersError) throw new Error(ordersError.message);

    let cancelled = 0;
    let skipped = 0;
    for (const order of orders ?? []) {
      const sessionId = order.stripe_session_id as string | null;
      if (sessionId) {
        try {
          const stripe = getStripe();
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          if (session.status === "complete") {
            skipped++;
            continue;
          }
          if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
        } catch (err) {
          // Could not be sure it is closed: leave it for tomorrow rather than cancel an order that may be paid.
          console.error(`[staff-order] Could not close the Checkout of ${order.id}:`, err);
          skipped++;
          continue;
        }
      }
      const { data: done } = await admin
        .from("orders")
        .update({ status: "cancelled", cancelled_at: now.toISOString() })
        .eq("id", order.id)
        .is("paid_at", null)
        .in("status", ["pending", "payment_failed"])
        .select("id");
      if (!done?.length) {
        skipped++;
        continue;
      }
      cancelled++;
      await addOrderTimelineEvent(
        order.id as string,
        "payment_link_expired",
        "Payment link expired unpaid — order cancelled",
      ).catch(() => undefined);
    }
    return { ok: true, cancelled, skipped };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "staff order link sweep failed" };
  }
}
