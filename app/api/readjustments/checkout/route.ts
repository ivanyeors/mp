import { NextResponse } from "next/server";
import { tooManyRequests } from "@/lib/rate-limit";
import { z } from "zod/v4";

import { isSlotFree } from "@/lib/appointments/book-slot";
import { recordBoxConsent } from "@/lib/marketing-consent/consent";
import { computeTax, resolveTaxRuleForRegion } from "@/lib/ecommerce/tax";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { SERVICE_LABELS, SERVICE_SKUS, loadServicePrices } from "@/lib/pricing/service-prices";
import { isFreeVisit } from "@/lib/readjustment/eligibility";
import {
  CHECKOUT_LIFETIME_MS,
  HOLD_LIFETIME_MS,
  createReadjustmentCheckoutSession,
} from "@/lib/readjustment/checkout";
import {
  ReadjustmentBookingSchema,
  checkSlotRequest,
  purchaseColumns,
  resolveBookingTarget,
  resolveSignedInCustomer,
} from "@/lib/readjustment/request";
import { getPublicOrigin } from "@/lib/site-url";
import { getStripe } from "@/lib/stripe/client";
import { errorTextWithoutStripeRequestId } from "@/lib/stripe/error-text";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BodySchema = z.object({ locale: z.string().optional() }).passthrough();

export async function POST(req: Request) {
  const customer = await resolveSignedInCustomer().catch(() => null);
  if (!customer) {
    return NextResponse.json({ error: "Sign in to book a re-adjustment" }, { status: 401 });
  }
  const limited = await tooManyRequests([
    { bucket: "readjustment-customer", key: customer.id, windowMs: 60 * 60_000, max: 10 },
  ]);
  if (limited) return limited;

  const raw = await req.json().catch(() => null);
  const parsed = ReadjustmentBookingSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, { status: 400 });
  }
  const body = parsed.data;
  const localeRaw = BodySchema.safeParse(raw).data?.locale;
  const locale = localeRaw && isSupportedLocale(localeRaw) ? localeRaw : DEFAULT_LOCALE;

  const checked = await checkSlotRequest(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.status });
  const { slot } = checked;

  const admin = supabaseAdmin();
  const resolved = await resolveBookingTarget(admin, customer.id, body);
  if (!resolved) return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  const { target } = resolved;
  if (isFreeVisit(target.quote)) {
    return NextResponse.json(
      { error: "This visit is complimentary", code: "complimentary", quote: target.quote },
      { status: 409 },
    );
  }
  const fee = target.quote.fee;

  const existing = await admin
    .from("readjustment_bookings")
    .select("id, fee_order_id")
    .eq("customer_id", customer.id)
    .eq("status", "awaiting_payment")
    .gt("hold_expires_at", new Date().toISOString())
    .eq("start_at", slot.startIso)
    .eq(
      target.kind === "platform" ? "order_item_id" : "purchase_source",
      target.kind === "platform" ? target.purchase.orderItemId : "unlisted",
    )
    .maybeSingle();
  if (existing.data?.fee_order_id) {
    const { data: order } = await admin
      .from("orders")
      .select("stripe_session_id")
      .eq("id", existing.data.fee_order_id)
      .maybeSingle();
    if (order?.stripe_session_id) {
      const session = await getStripe().checkout.sessions.retrieve(order.stripe_session_id as string);
      if (session.status === "open" && session.url) {
        return NextResponse.json({ ok: true, url: session.url, bookingId: existing.data.id });
      }
    }
  }

  if (!(await isSlotFree(slot.startIso, slot.endIso))) {
    return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
  }

  const now = Date.now();
  const sessionExpiresAt = new Date(now + CHECKOUT_LIFETIME_MS + 15_000);
  const holdExpiresAt = new Date(now + HOLD_LIFETIME_MS);

  const { data: booking, error: bookErr } = await admin
    .from("readjustment_bookings")
    .insert({
      customer_id: customer.id,
      ...purchaseColumns(target),
      complimentary: false,
      complimentary_seq: null,
      fee_amount: fee,
      location_id: slot.location.id,
      location_name: slot.location.name,
      start_at: slot.startIso,
      end_at: slot.endIso,
      guest_name: body.guest_name,
      phone: slot.phone,
      email: customer.email,
      status: "awaiting_payment",
      hold_expires_at: holdExpiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (bookErr || !booking) {
    return NextResponse.json({ error: bookErr?.message ?? "Booking failed" }, { status: 500 });
  }

  const abandon = async (orderId: string | null) => {
    const stamp = new Date().toISOString();
    await admin
      .from("readjustment_bookings")
      .update({ status: "expired", hold_expires_at: null, updated_at: stamp })
      .eq("id", booking.id);
    if (orderId) {
      await admin.from("orders").update({ status: "cancelled", cancelled_at: stamp }).eq("id", orderId);
    }
  };

  const taxRule = await resolveTaxRuleForRegion("SG");
  const tax = computeTax({ subtotal: fee, shippingAmount: 0, discountAmount: 0 }, taxRule).taxAmount;
  const label =
    target.kind === "platform"
      ? `${target.purchase.label} · Order #${target.purchase.orderNumber}`
      : "Pillow not listed on account";

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      order_number: "",
      customer_id: customer.id,
      email: customer.email,
      phone: slot.phone,
      status: "pending",
      currency: "SGD",
      subtotal: fee,
      shipping_amount: 0,
      tax_amount: tax,
      discount_amount: 0,
      total: fee + tax,
      shipping_address: {
        recipient: body.guest_name,
        line1: slot.location.address,
        city: "Singapore",
        postal_code: "—",
        country: "SG",
      },
      locale,
      notes: `Re-adjustment at ${slot.location.name}`,
    })
    .select("id, order_number")
    .single();
  if (orderErr || !order) {
    await abandon(null);
    return NextResponse.json({ error: orderErr?.message ?? "Failed to create order" }, { status: 500 });
  }

  let serviceCost: number | null = null;
  try {
    serviceCost = (await loadServicePrices(admin)).readjustment.costPrice;
  } catch {}
  const { error: lineErr } = await admin.from("order_items").insert({
    order_id: order.id,
    variant_id: null,
    kind: "service",
    service_key: "readjustment",
    sku: SERVICE_SKUS.readjustment,
    product_title: SERVICE_LABELS.readjustment,
    variant_title: label,
    quantity: 1,
    unit_price: fee,
    total_price: fee,
    unit_cost: serviceCost,
    total_cost: serviceCost,
  });
  if (lineErr) {
    await abandon(order.id);
    return NextResponse.json({ error: lineErr.message }, { status: 500 });
  }
  await admin.from("readjustment_bookings").update({ fee_order_id: order.id }).eq("id", booking.id);

  const origin = getPublicOrigin(req);
  const cancelPath =
    target.kind === "platform"
      ? `/appointments?type=readjustment&item=${encodeURIComponent(target.purchase.orderItemId)}`
      : "/appointments?type=readjustment";
  let session: { sessionId: string; url: string };
  try {
    session = await createReadjustmentCheckoutSession({
      amount: fee,
      tax,
      currency: "SGD",
      customerEmail: customer.email,
      orderId: order.id,
      orderNumber: order.order_number,
      bookingId: booking.id,
      label,
      languagePreference: body.language_preference,
      successUrl: `${origin}${withLocale(`/appointments/confirmed?booking=${booking.id}`, locale)}`,
      cancelUrl: `${origin}${withLocale(cancelPath, locale)}`,
      expiresAt: sessionExpiresAt,
    });
  } catch (e) {
    await abandon(order.id);
    return NextResponse.json(
      { error: errorTextWithoutStripeRequestId(e, "Could not start payment") },
      { status: 502 },
    );
  }
  await admin.from("orders").update({ stripe_session_id: session.sessionId }).eq("id", order.id);

  await recordBoxConsent(admin, customer.id, body.marketing_email === true, "appointment");

  return NextResponse.json({ ok: true, url: session.url, bookingId: booking.id });
}
