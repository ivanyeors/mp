/**
 * Open Stripe Checkout for a Staff order's Payment link (ADR 0048).
 *
 * Our link is durable; a Checkout Session is not (an hour here, a PayNow QR an
 * hour too). So every Pay press asks for one: an open session is reused, and a
 * new one is made for exactly the Order's stored total. Only one session is
 * ever the Order's: a new one is installed on `orders.stripe_session_id` by
 * compare-and-set, and a request that loses expires its own before anyone sees
 * it. The session carries `order_id`, so the webhook's shop branch settles it.
 */

import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getStripe } from "@/lib/stripe/client";
import { SHOP_CHECKOUT_LIFETIME_MS } from "@/lib/stripe/checkout-lifetime";
import { DEFAULT_LOCALE, isSupportedLocale } from "@/lib/i18n/locales";
import { checkGoodsStock } from "@/lib/staff-orders/quote";
import { loadPayLinkByToken, payLinkUrl, type LoadedPayLink } from "@/lib/staff-orders/link";
import { STAFF_ORDER_PURPOSE, mergeQuantities, payLinkState, round2, type PayLinkState } from "@/lib/staff-orders/shared";

export type OpenCheckoutOutcome =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string; state?: PayLinkState | "confirming" };

const cents = (amount: number) => Math.round(amount * 100);

/**
 * The session's line items, shipping and discount, built from what the Order
 * stores so Stripe charges exactly `orders.total`: every line at its unit
 * price, any tax as its own line (the total less what the lines, shipping and
 * discount already make), shipping as a fixed rate, a discount as a one-off
 * coupon. Pure, for the tests.
 */
export function checkoutAmounts(loaded: Pick<LoadedPayLink, "order" | "items">): {
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];
  shipping: number;
  discount: number;
  tax: number;
} {
  const { order, items } = loaded;
  const currency = (order.currency || "SGD").toLowerCase();
  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = items.map((i) => ({
    quantity: i.quantity,
    price_data: {
      currency,
      unit_amount: cents(i.unit_price),
      product_data: {
        name: i.product_title,
        ...(i.variant_title ? { description: i.variant_title } : {}),
      },
    },
  }));
  const shipping = round2(order.shipping_amount);
  const discount = round2(order.discount_amount);
  const tax = round2(order.total - (order.subtotal - discount + shipping));
  if (tax > 0) {
    lineItems.push({ quantity: 1, price_data: { currency, unit_amount: cents(tax), product_data: { name: "Tax" } } });
  }
  return { lineItems, shipping, discount, tax };
}

export async function openStaffOrderCheckout(
  admin: SupabaseClient,
  token: string,
  opts: { origin: string; now?: Date },
): Promise<OpenCheckoutOutcome> {
  const now = opts.now ?? new Date();
  const loaded = await loadPayLinkByToken(admin, token);
  if (!loaded) return { ok: false, status: 404, error: "This payment link doesn't exist." };
  const { order, items, link } = loaded;

  const state = payLinkState(order, link, now);
  if (state !== "payable") return { ok: false, status: 409, error: stateMessage(state), state };

  const stripe = getStripe();
  const previous = order.stripe_session_id;
  if (previous) {
    const session = await stripe.checkout.sessions.retrieve(previous);
    if (session.status === "open" && session.url) return { ok: true, url: session.url };
    // Paid a moment ago: the webhook has not confirmed it yet.
    if (session.status === "complete") {
      return { ok: false, status: 409, error: "We're confirming your payment.", state: "confirming" };
    }
  }

  // Stock may have gone since Staff made the order.
  const goods = mergeQuantities(
    items
      .filter((i) => i.variant_id && i.kind !== "service")
      .map((i) => ({ variantId: i.variant_id!, quantity: i.quantity, title: i.product_title, variantTitle: i.variant_title })),
    "variantId",
  );
  const shortage = await checkGoodsStock(admin, goods);
  if (shortage) {
    return {
      ok: false,
      status: 409,
      error: `${shortage} Please contact us and we'll sort out your order before you pay.`,
    };
  }

  const locale = isSupportedLocale(order.locale) ? order.locale : DEFAULT_LOCALE;
  const pageUrl = payLinkUrl(opts.origin, link.token, locale);
  const { lineItems, shipping, discount } = checkoutAmounts(loaded);
  const currency = (order.currency || "SGD").toLowerCase();
  const metadata = { order_id: order.id, order_number: order.order_number, purpose: STAFF_ORDER_PURPOSE };

  const params: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    customer_email: order.email,
    line_items: lineItems,
    metadata,
    // Mirrored so payment_intent.* events can find the Order too.
    payment_intent_data: { metadata },
    success_url: `${pageUrl}?paid=1`,
    cancel_url: pageUrl,
    expires_at: Math.floor((now.getTime() + SHOP_CHECKOUT_LIFETIME_MS) / 1000),
  };
  if (shipping > 0) {
    params.shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: { amount: cents(shipping), currency },
          display_name: order.shipping_courier ? `Shipping — ${order.shipping_courier}` : "Shipping",
        },
      },
    ];
  }
  if (discount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: cents(discount),
      currency,
      duration: "once",
      name: order.coupon_code ? `Discount (${order.coupon_code})` : "Discount",
    });
    params.discounts = [{ coupon: coupon.id }];
  }

  const session = await stripe.checkout.sessions.create(params);
  if (!session.url) throw new Error("Checkout session missing url");

  // Install it only if nobody else did since we read the Order.
  let claim = admin
    .from("orders")
    .update({ stripe_session_id: session.id })
    .eq("id", order.id)
    .is("paid_at", null)
    .in("status", ["pending", "payment_failed"]);
  claim = previous ? claim.eq("stripe_session_id", previous) : claim.is("stripe_session_id", null);
  const { data: claimed, error: claimError } = await claim.select("id");
  if (claimError) throw new Error(claimError.message);

  if (!claimed?.length) {
    // Another press won. Close ours so it can never be paid, then send them to the winner's.
    await stripe.checkout.sessions.expire(session.id).catch(() => undefined);
    const { data: current } = await admin.from("orders").select("stripe_session_id").eq("id", order.id).maybeSingle();
    const winner = current?.stripe_session_id as string | undefined;
    if (winner) {
      const theirs = await stripe.checkout.sessions.retrieve(winner);
      if (theirs.status === "open" && theirs.url) return { ok: true, url: theirs.url };
    }
    return { ok: false, status: 409, error: "Something changed while we opened the payment. Please try again." };
  }

  return { ok: true, url: session.url };
}

function stateMessage(state: PayLinkState): string {
  switch (state) {
    case "paid":
      return "This order is already paid.";
    case "expired":
      return "This payment link has expired. Ask us for a new one.";
    case "closed":
      return "This order is no longer awaiting payment.";
    default:
      return "";
  }
}
