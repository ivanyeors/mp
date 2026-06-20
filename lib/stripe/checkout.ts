import Stripe from "stripe";
import { getStripe } from "./client";
import type { ProductVariant } from "@/lib/types/ecommerce";

interface CheckoutLineItem {
  variant: ProductVariant;
  quantity: number;
}

interface CreateCheckoutOpts {
  lineItems: CheckoutLineItem[];
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  successUrl: string;
  cancelUrl: string;
  shippingAmount?: number;
  shippingLabel?: string;
  /**
   * Tax to add as an explicit line item (exclusive tax only). Pass 0/undefined
   * for inclusive tax, which is already embedded in the line-item prices.
   */
  taxAmount?: number;
  taxLabel?: string;
  /** Optional server cart token, persisted to metadata so the webhook can clear it. */
  cartToken?: string;
  /**
   * Stable key (e.g. `checkout_${orderId}`) so a double-submitted checkout
   * reuses the same Stripe session instead of creating duplicates.
   */
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

/**
 * Create a Stripe Checkout Session from cart items.
 * Each item must have a variant with a valid stripe_price_id.
 */
export async function createCheckoutSession(opts: CreateCheckoutOpts) {
  const stripe = getStripe();

  // Validate all variants have stripe_price_id
  for (const item of opts.lineItems) {
    if (!item.variant.stripe_price_id) {
      throw new Error(`Variant "${item.variant.title || item.variant.id}" has no Stripe Price ID`);
    }
  }

  const currency = opts.lineItems[0]?.variant.currency.toLowerCase() ?? "sgd";

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = opts.lineItems.map(
    (item) => ({
      price: item.variant.stripe_price_id!,
      quantity: item.quantity,
    })
  );

  // Exclusive tax is rendered as a dedicated line item so the Stripe-charged
  // total matches the order total persisted in our DB.
  if (opts.taxAmount && opts.taxAmount > 0) {
    lineItems.push({
      price_data: {
        currency,
        unit_amount: Math.round(opts.taxAmount * 100),
        product_data: { name: opts.taxLabel ?? "Tax" },
      },
      quantity: 1,
    });
  }

  const metadata: Record<string, string> = {
    order_id: opts.orderId,
    order_number: opts.orderNumber,
    ...(opts.cartToken ? { cart_token: opts.cartToken } : {}),
    ...opts.metadata,
  };

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
    customer_email: opts.customerEmail,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata,
    // Mirror metadata onto the PaymentIntent so payment_intent.* webhook events
    // (e.g. payment_failed) can be linked back to the order before the order
    // ever stores a payment_reference.
    payment_intent_data: {
      metadata,
    },
  };

  // Add shipping as a fixed amount if provided
  if (opts.shippingAmount && opts.shippingAmount > 0) {
    sessionParams.shipping_options = [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: Math.round(opts.shippingAmount * 100),
            currency,
          },
          display_name: opts.shippingLabel ?? "Shipping",
        },
      },
    ];
  }

  const session = await stripe.checkout.sessions.create(
    sessionParams,
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined
  );

  return {
    sessionId: session.id,
    url: session.url,
  };
}
