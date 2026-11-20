import Stripe from "stripe";
import { getStripe } from "./client";
import { stripePriceIdOf } from "./mode";
import type { ProductVariant } from "@/lib/types/ecommerce";
import { SHOP_CHECKOUT_LIFETIME_MS } from "@/lib/stripe/checkout-lifetime";
import type { PaymentUi } from "./payment-ui";

interface CheckoutLineItem {
  variant: ProductVariant;
  quantity: number;
  addonAmount?: number;
  addonLabel?: string;
}

interface CreateCheckoutOpts {
  lineItems: CheckoutLineItem[];
  customerEmail: string;
  orderId: string;
  orderNumber: string;
  successUrl: string;
  cancelUrl: string;
  ui?: PaymentUi;
  shippingAmount?: number;
  shippingLabel?: string;
  discountAmount?: number;
  discountLabel?: string;
  automaticTax?: boolean;
  customerAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  };
  customerName?: string;
  taxAmount?: number;
  taxLabel?: string;
  cartToken?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
}

export async function createCheckoutSession(opts: CreateCheckoutOpts) {
  const stripe = getStripe();

  const priceIdByVariant = new Map<string, string>();
  for (const item of opts.lineItems) {
    const priceId = stripePriceIdOf(item.variant);
    if (!priceId) {
      throw new Error(`Variant "${item.variant.title || item.variant.id}" has no Stripe Price ID`);
    }
    priceIdByVariant.set(item.variant.id, priceId);
  }

  const currency = opts.lineItems[0]?.variant.currency.toLowerCase() ?? "sgd";

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = opts.lineItems.map(
    (item) => {
      const delta = item.addonAmount ?? 0;
      if (delta === 0) {
        return { price: priceIdByVariant.get(item.variant.id)!, quantity: item.quantity };
      }
      return {
        price_data: {
          currency,
          unit_amount: Math.round((item.variant.price + delta) * 100),
          tax_behavior: "exclusive" as const,
          product_data: {
            name: item.addonLabel ?? item.variant.title ?? "Custom build",
          },
        },
        quantity: item.quantity,
      };
    }
  );

  if (!opts.automaticTax && opts.taxAmount && opts.taxAmount > 0) {
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

  const page: Partial<Stripe.Checkout.SessionCreateParams> =
    opts.ui === "elements"
      ? { ui_mode: "elements", return_url: opts.successUrl }
      : { success_url: opts.successUrl, cancel_url: opts.cancelUrl };

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
    ...page,
    metadata,
    payment_intent_data: {
      metadata,
    },
  };

  if (opts.automaticTax && opts.customerAddress) {
    const customer = await stripe.customers.create({
      email: opts.customerEmail,
      name: opts.customerName,
      address: {
        line1: opts.customerAddress.line1,
        line2: opts.customerAddress.line2,
        city: opts.customerAddress.city,
        state: opts.customerAddress.state,
        postal_code: opts.customerAddress.postal_code,
        country: opts.customerAddress.country,
      },
    });
    sessionParams.customer = customer.id;
    sessionParams.automatic_tax = { enabled: true };
  } else {
    sessionParams.customer_email = opts.customerEmail;
  }

  if (opts.discountAmount && opts.discountAmount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(opts.discountAmount * 100),
      currency,
      duration: "once",
      name: opts.discountLabel ?? "Discount",
    });
    sessionParams.discounts = [{ coupon: coupon.id }];
  }

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
          // ponytail: mark shipping tax-exclusive so Stripe Tax treats the rate
          // as a pre-tax amount. Whether shipping is actually taxed is then
          // Stripe's jurisdiction call; our manual model leaves shipping untaxed.
          ...(opts.automaticTax ? { tax_behavior: "exclusive" as const } : {}),
        },
      },
    ];
  }

  sessionParams.expires_at = Math.floor((Date.now() + SHOP_CHECKOUT_LIFETIME_MS) / 1000);

  const session = await stripe.checkout.sessions.create(
    sessionParams,
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined
  );

  return {
    sessionId: session.id,
    url: session.url,
    clientSecret: session.client_secret ?? null,
  };
}
