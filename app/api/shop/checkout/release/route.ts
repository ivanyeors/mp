import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, tooManyRequests } from "@/lib/rate-limit";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe/client";
import { addOrderTimelineEvent } from "@/lib/ecommerce/orders";
import { releasePoints } from "@/lib/points/spend";

export const runtime = "nodejs";

const ReleaseSchema = z.object({
  session_id: z.string().startsWith("cs_").max(255),
});

/**
 * Closes the Checkout behind an unpaid shop Order when the shopper leaves the
 * on-page payment step to edit their details (ADR 0052).
 *
 * Paying on our page means the Order and its Checkout Session exist before
 * the shopper pays, and "Edit details" sends them back to a form that makes a
 * new Order. Left alone, the old one would hold its reserved points until the
 * Session lapsed within the hour, so a shopper resubmitting with points would
 * be told they had none. This expires the Session and cancels the Order now,
 * which is exactly what `checkout.session.expired` would do later; that event
 * still arrives, finds the Order cancelled, and its points release is a replay
 * that writes nothing.
 *
 * The Session id is the capability token, as on the confirmation page: only
 * the browser that opened the Checkout has it. A paid, closed or unknown
 * Session is answered `released: false` and nothing changes.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = ReleaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const limited = await tooManyRequests([
    { bucket: "checkout-release-ip", key: clientIp(req), windowMs: 10 * 60_000, max: 30 },
  ]);
  if (limited) return limited;

  const sessionId = parsed.data.session_id;
  const admin = supabaseAdmin();

  const { data: order, error } = await admin
    .from("orders")
    .select("id, status, paid_at")
    .eq("stripe_session_id", sessionId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "We couldn't look up this checkout." }, { status: 500 });
  }
  if (!order || order.paid_at || order.status !== "pending") {
    return NextResponse.json({ ok: true, released: false });
  }

  // Close the Session first, so it cannot be paid after its Order is
  // cancelled. A Session Stripe already completed is paid: leave it to the
  // webhook, which confirms the Order.
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === "complete") {
      return NextResponse.json({ ok: true, released: false });
    }
    if (session.status === "open") await stripe.checkout.sessions.expire(sessionId);
  } catch (err) {
    console.error(`[checkout/release] Could not close Checkout ${sessionId}:`, err);
    return NextResponse.json({ error: "We couldn't close this checkout. Please try again." }, { status: 502 });
  }

  const { data: cancelled } = await admin
    .from("orders")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("paid_at", null)
    .select("id")
    .maybeSingle();

  if (cancelled) {
    await addOrderTimelineEvent(
      order.id,
      "checkout_released",
      "Shopper went back to edit their details before paying — checkout closed, order cancelled",
      { stripe_session_id: sessionId },
    ).catch((err) => console.error(`[checkout/release] Timeline event failed for ${order.id}:`, err));
  }

  // Not critical: the daily sweep releases any reservation on a cancelled
  // Order that this misses.
  const released = await releasePoints(admin, order.id);
  if (released.ok && released.released) {
    await addOrderTimelineEvent(order.id, "points_released", "Points reserved at checkout returned", {}).catch(
      (err) => console.error(`[checkout/release] Timeline event failed for ${order.id}:`, err),
    );
  }

  return NextResponse.json({ ok: true, released: Boolean(cancelled) });
}
