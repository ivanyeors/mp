import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

/**
 * Dev-only Stripe wiring probe. Creates the barest possible Checkout Session — a
 * single hardcoded SGD 1.00 line item, no coupon / customer / automatic_tax — so
 * a failure points squarely at Stripe credentials or key permissions, not at the
 * order/tax pipeline. Returns the Stripe error message verbatim for diagnosis.
 *
 * ponytail: hardcoded price + no idempotency. It's a throwaway probe, not a real
 * order path; disabled outside development.
 */
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Test checkout is disabled in production" }, { status: 404 });
  }

  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "sgd",
            unit_amount: 100,
            product_data: { name: "Stripe wiring test" },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/stripe-test?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/stripe-test?status=cancelled`,
    });

    return NextResponse.json({ ok: true, url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe session creation failed";
    console.error("[stripe/test-checkout]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
