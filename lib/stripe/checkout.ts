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

  const lineItems = opts.lineItems.map((item) => ({
    price: item.variant.stripe_price_id!,
    quantity: item.quantity,
  }));

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
    customer_email: opts.customerEmail,
    success_url: opts.successUrl,
    cancel_url: opts.cancelUrl,
    metadata: {
      order_id: opts.orderId,
      order_number: opts.orderNumber,
      ...opts.metadata,
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
            currency: opts.lineItems[0]?.variant.currency.toLowerCase() ?? "sgd",
          },
          display_name: opts.shippingLabel ?? "Shipping",
        },
      },
    ];
  }

  const session = await stripe.checkout.sessions.create(sessionParams);

  return {
    sessionId: session.id,
    url: session.url,
  };
}
