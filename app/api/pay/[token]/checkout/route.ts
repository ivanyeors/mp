import { NextResponse } from "next/server";

import { clientIp, tooManyRequests } from "@/lib/rate-limit";
import { getPublicOrigin } from "@/lib/site-url";
import { openStaffOrderCheckout } from "@/lib/staff-orders/checkout";
import { isPayLinkToken } from "@/lib/staff-orders/shared";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pay/[token]/checkout — the Pay button of a Payment link (ADR 0048).
 *
 * Public: the token is the credential. Answers the Stripe Checkout URL for the
 * Order's stored total, reusing an open session. The body carries nothing; no
 * amount is ever read from the request.
 */
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!isPayLinkToken(token)) return NextResponse.json({ error: "This payment link doesn't exist." }, { status: 404 });

  // A guessed token costs the same as any other lookup; a real one opens at most a few sessions.
  const limited = await tooManyRequests([
    { bucket: "pay-link-ip", key: clientIp(req), windowMs: 10 * 60_000, max: 30 },
    { bucket: "pay-link-token", key: token, windowMs: 10 * 60_000, max: 10 },
  ]);
  if (limited) return limited;

  try {
    const outcome = await openStaffOrderCheckout(supabaseAdmin(), token, { origin: getPublicOrigin(req) });
    if (!outcome.ok) {
      return NextResponse.json({ error: outcome.error, state: outcome.state ?? null }, { status: outcome.status });
    }
    return NextResponse.json({ ok: true, url: outcome.url });
  } catch (err) {
    console.error("[pay] Could not open Checkout:", err);
    return NextResponse.json({ error: "We couldn't open the payment page. Please try again." }, { status: 502 });
  }
}
