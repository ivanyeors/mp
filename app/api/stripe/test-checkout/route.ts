import { NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe/client";

export const runtime = "nodejs";

/**
 * Dev-only Stripe E2E probe.
 *
 * POST { kind: "payment" | "hold" } — bare Checkout Session (SGD 1.00), either
 * auto-capture or manual-capture (authorization hold). No coupon/customer/tax.
 *
 * GET ?session_id=cs_… — inspect session + PaymentIntent after return from Stripe.
 * GET (no params) — report whether keys look like test mode and webhook secret is set.
 *
 * ponytail: hardcoded price + no idempotency. Throwaway probe, not a real order path.
 */

function devOnly() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Test checkout is disabled in production" }, { status: 404 });
  }
  return null;
}

function keyMode(key: string | undefined): "test" | "live" | "missing" | "unknown" {
  if (!key) return "missing";
  if (key.includes("_test_")) return "test";
  if (key.includes("_live_")) return "live";
  return "unknown";
}

export async function GET(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");

  if (!sessionId) {
    const secretMode = keyMode(process.env.STRIPE_SECRET_KEY);
    const publishableMode = keyMode(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
    return NextResponse.json({
      ok: true,
      secretMode,
      publishableMode,
      webhookSecretSet: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? null,
      readyForTestCards: secretMode === "test",
    });
  }

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["payment_intent"],
    });
    const pi =
      session.payment_intent && typeof session.payment_intent !== "string"
        ? session.payment_intent
        : null;

    return NextResponse.json({
      ok: true,
      session: {
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        mode: session.mode,
      },
      paymentIntent: pi
        ? {
            id: pi.id,
            status: pi.status,
            capture_method: pi.capture_method,
            amount: pi.amount,
            currency: pi.currency,
            amount_capturable: pi.amount_capturable,
          }
        : null,
      // Hold path success: authorized but not captured.
      isHold:
        pi?.capture_method === "manual" &&
        (pi.status === "requires_capture" || pi.amount_capturable > 0),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to retrieve session";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const blocked = devOnly();
  if (blocked) return blocked;

  const secretMode = keyMode(process.env.STRIPE_SECRET_KEY);
  if (secretMode === "live") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "STRIPE_SECRET_KEY is a live key (…_live_…). Test cards only work with test keys (sk_test_… / rk_test_…). Flip the Dashboard to Test mode and paste the test secret into .env.local.",
      },
      { status: 400 },
    );
  }

  let kind: "payment" | "hold" = "payment";
  try {
    const body = (await req.json().catch(() => ({}))) as { kind?: string };
    if (body.kind === "hold") kind = "hold";
  } catch {
    // empty body is fine
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
            product_data: {
              name: kind === "hold" ? "Stripe hold test (auth only)" : "Stripe payment test",
              description:
                kind === "hold"
                  ? "Card authorization only — not charged until capture."
                  : "Full charge (auto-capture).",
            },
          },
          quantity: 1,
        },
      ],
      ...(kind === "hold"
        ? {
            payment_intent_data: {
              capture_method: "manual" as const,
              metadata: { probe: "stripe-test-hold" },
            },
            metadata: { probe: "stripe-test-hold" },
          }
        : {
            metadata: { probe: "stripe-test-payment" },
          }),
      success_url: `${origin}/stripe-test?status=success&kind=${kind}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/stripe-test?status=cancelled&kind=${kind}`,
    });

    return NextResponse.json({ ok: true, url: session.url, kind });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stripe session creation failed";
    console.error("[stripe/test-checkout]", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
