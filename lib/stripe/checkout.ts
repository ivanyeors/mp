import Stripe from "stripe";
import { getStripe } from "./client";
import { stripePriceIdOf } from "./mode";
import type { ProductVariant } from "@/lib/types/ecommerce";

interface CheckoutLineItem {
  variant: ProductVariant;
  quantity: number;
  /**
   * Per-unit customization adjustment (major units, e.g. dollars), SIGNED: negative
   * when the chosen build is cheaper than the variant's shelf price. Non-zero makes
   * the line dynamic at `variant.price + addonAmount`, since the variant's Stripe
   * Price is fixed. Omit/0 for non-customized items.
   */
  addonAmount?: number;
  /** Display name for a customised line item; defaults to the variant title. */
  addonLabel?: string;
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
   * Order-level discount in major units. Applied as a per-checkout Stripe
   * `amount_off` coupon so the Stripe charge reflects the discount (otherwise
   * the customer is charged the full pre-discount amount — the "discount leak").
   */
  discountAmount?: number;
  /** Coupon display name shown on the Stripe receipt; defaults to "Discount". */
  discountLabel?: string;
  /**
   * When true, let Stripe Tax compute tax (SG GST) on the post-discount amount
   * instead of adding a manual tax line item. Requires Stripe Tax enabled +
   * the SG GST registration in the Dashboard, so it is env-gated by the caller.
   */
  automaticTax?: boolean;
  /**
   * Customer address Stripe Tax needs to determine the jurisdiction. Provided
   * (not re-collected) so the shopper isn't asked twice. Required when
   * `automaticTax` is set.
   */
  customerAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state?: string;
    postal_code: string;
    country: string;
  };
  /** Customer name attached to the Stripe customer (for tax/receipt). */
  customerName?: string;
  /**
   * Tax to add as an explicit line item (exclusive tax only), used only when
   * `automaticTax` is off. Pass 0/undefined for inclusive tax, which is already
   * embedded in the line-item prices.
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
 * Each item must have a variant with a Price in the CURRENT Stripe account.
 */
export async function createCheckoutSession(opts: CreateCheckoutOpts) {
  const stripe = getStripe();

  // A Price id from the other account would be rejected by Stripe as
  // `resource_missing` mid-checkout, so resolve per mode and refuse up front.
  const priceIdByVariant = new Map<string, string>();
  for (const item of opts.lineItems) {
    const priceId = stripePriceIdOf(item.variant);
    if (!priceId) {
      throw new Error(`Variant "${item.variant.title || item.variant.id}" has no Stripe Price ID`);
    }
    priceIdByVariant.set(item.variant.id, priceId);
  }

  const currency = opts.lineItems[0]?.variant.currency.toLowerCase() ?? "sgd";

  // An uncustomised unit bills against its catalog Price, which keeps the Stripe
  // product the shopper sees on the receipt.
  //
  // A customised one cannot: the adjustment moves in EITHER direction — a case
  // cheaper than the one the build ships is a genuine reduction — and Stripe has no
  // negative line item to express that. The old shape (catalog Price + a surcharge
  // line, `addonAmount <= 0` skipped) silently dropped every downgrade and charged
  // the dearer build. So a customised unit is billed as one dynamic line at its
  // composed price, which is what `order_items.unit_price` records either way.
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
          // Matches the catalog Price this line stands in for, so an automatic-tax
          // checkout treats the two identically.
          tax_behavior: "exclusive" as const,
          product_data: {
            name: item.addonLabel ?? item.variant.title ?? "Custom build",
          },
        },
        quantity: item.quantity,
      };
    }
  );

  // Exclusive tax is rendered as a dedicated line item so the Stripe-charged
  // total matches the order total persisted in our DB. Skipped when Stripe Tax
  // is enabled — there, Stripe computes tax on the post-discount amount.
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

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: "payment",
    line_items: lineItems,
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

  // Stripe Tax needs a customer address to pick the jurisdiction. We already
  // collected it, so attach it to a Stripe Customer (no second prompt) rather
  // than letting the hosted page re-ask. Outside Stripe-Tax mode a guest email
  // is enough.
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

  // Apply the order discount as a one-off Stripe coupon so the Stripe charge is
  // reduced (free-shipping discounts carry no amount_off — they already zero the
  // shipping rate upstream).
  if (opts.discountAmount && opts.discountAmount > 0) {
    const coupon = await stripe.coupons.create({
      amount_off: Math.round(opts.discountAmount * 100),
      currency,
      duration: "once",
      name: opts.discountLabel ?? "Discount",
    });
    sessionParams.discounts = [{ coupon: coupon.id }];
  }

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
          // ponytail: mark shipping tax-exclusive so Stripe Tax treats the rate
          // as a pre-tax amount. Whether shipping is actually taxed is then
          // Stripe's jurisdiction call; our manual model leaves shipping untaxed.
          ...(opts.automaticTax ? { tax_behavior: "exclusive" as const } : {}),
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
