import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { requireAdmin } from "@/lib/auth/admin";
import { getStripe } from "@/lib/stripe/client";
import { listMatchingStripePayments } from "@/lib/staff-orders/stripe-payments";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AMOUNT = 1_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  const denied = await requireAdmin("orders");
  if (denied) return denied;

  const query = new URL(req.url).searchParams;
  const amount = Number(query.get("amount"));
  const orderId = query.get("order_id");
  if (orderId !== null && !UUID.test(orderId)) {
    return NextResponse.json({ error: "order_id is not an order" }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return NextResponse.json({ error: "amount is required" }, { status: 400 });
  }

  let stripe: Stripe;
  try {
    stripe = getStripe();
  } catch {
    return NextResponse.json({ error: "Stripe isn't connected here, so its payments can't be listed." }, { status: 503 });
  }

  try {
    const payments = await listMatchingStripePayments(supabaseAdmin(), stripe, {
      amount,
      currency: "SGD",
      ...(orderId ? { orderId } : {}),
    });
    return NextResponse.json({ ok: true, payments });
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe's payments could not be read: ${err instanceof Error ? err.message : "unknown error"}` },
      { status: 502 },
    );
  }
}
