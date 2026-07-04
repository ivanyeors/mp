import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth/user";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_FIELDS =
  "id, status, product_type, suggested_size, suggested_tier, suggested_length, assigned_size, assigned_tier, assigned_length, preference_lines, addon_lines, shipping_method, authorized_amount, final_amount, currency, created_at, updated_at, customer_email, payment_intent_id";

/**
 * Public Result status for the customer status page.
 * Auth: access_token query param (guest magic link) or logged-in customer email/id match.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const sessionId = url.searchParams.get("session_id");

  const admin = supabaseAdmin();
  const { data: row, error } = await admin
    .from("mp_config_responses")
    .select(`${PUBLIC_FIELDS}, access_token, customer_id`)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = false;
  if (token && row.access_token && token === row.access_token) {
    allowed = true;
  } else {
    const user = await getAuthUser();
    if (user) {
      const { data: customer } = await admin
        .from("customers")
        .select("id, email")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (
        customer &&
        (customer.id === row.customer_id ||
          (row.customer_email &&
            customer.email?.toLowerCase() === row.customer_email.toLowerCase()))
      ) {
        allowed = true;
      }
    }
  }

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Sync payment_intent_id from Checkout session when returning from Stripe.
  if (sessionId && !row.payment_intent_id) {
    try {
      const stripe = getStripe();
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      const metaId = session.metadata?.result_id;
      if (metaId === id) {
        const pi =
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        if (pi) {
          await admin
            .from("mp_config_responses")
            .update({ payment_intent_id: pi })
            .eq("id", id);
          row.payment_intent_id = pi;
        }
      }
    } catch (e) {
      console.error("Failed to sync payment intent from session", e);
    }
  }

  const { access_token: _t, customer_id: _c, ...publicRow } = row;
  return NextResponse.json({ result: publicRow });
}
