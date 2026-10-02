"use client";

import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle, Loader2, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/shop/cart-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Order } from "@/lib/types/ecommerce";
import { formatCurrency as formatPrice } from "@/lib/i18n/currencies";
import { trackGaEventOnce } from "@/lib/analytics/ga-events";

// ---------------------------------------------------------------------------
// Confirmation Page
// ---------------------------------------------------------------------------

export default function OrderConfirmationPage() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("order_number") ?? searchParams.get("order");
  const sessionId = searchParams.get("session_id");

  const { clearCart } = useCart();

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    // The order is looked up by order number, gated by the Stripe session id
    // (a capability token), so both are required to load order details.
    if (!orderNumber || !sessionId) return;

    setLoading(true);
    const url = `/api/shop/orders/by-number/${encodeURIComponent(
      orderNumber
    )}?session_id=${encodeURIComponent(sessionId)}`;

    fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error("Order not found");
        return res.json();
      })
      .then((data: { ok: boolean; order: Order }) => {
        setOrder(data.order);
        // GA4 purchase, once per order in this browser: the page can be refreshed or bookmarked.
        const o = data.order;
        if (!["cancelled", "refunded", "payment_failed"].includes(o.status)) {
          trackGaEventOnce(`purchase:${o.order_number}`, {
            name: "purchase",
            params: {
              transaction_id: o.order_number,
              value: Number(o.total),
              currency: o.currency,
              shipping: Number(o.shipping_amount ?? 0),
              tax: Number(o.tax_amount ?? 0),
              ...(o.coupon_code ? { coupon: o.coupon_code } : {}),
              items: (o.items ?? []).map((it) => ({
                item_id: it.variant_id ?? it.sku,
                item_name: it.product_title,
                ...(it.variant_title ? { item_variant: it.variant_title } : {}),
                price: Number(it.unit_price),
                quantity: it.quantity,
              })),
            },
          });
        }
        // Payment went through and the order was confirmed for this Stripe
        // session, so the local cart is spent. Clearing it here (instead of
        // before the Stripe redirect) keeps the items available if the shopper
        // cancels payment or presses back from Stripe.
        clearCart();
      })
      .catch(() => setFetchError(true))
      .finally(() => setLoading(false));
  }, [orderNumber, sessionId, clearCart]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 flex flex-col items-center gap-8 text-center">
      {/* Success icon */}
      <div className="flex flex-col items-center gap-4">
        <div className="rounded-full bg-green-100 dark:bg-green-900/30 p-5">
          <CheckCircle className="size-12 text-green-600 dark:text-green-400" />
        </div>

        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Thank you for your order!
          </h1>
          <p className="text-muted-foreground mt-1">
            We&apos;ll send a confirmation email to your address.
          </p>
        </div>
      </div>

      {/* Order number */}
      {orderNumber && (
        <Card className="w-full">
          <CardContent className="pt-6 pb-6 flex flex-col items-center gap-1">
            <p className="text-sm text-muted-foreground">Order number</p>
            <p className="text-2xl font-bold tracking-widest uppercase text-foreground">
              {orderNumber}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Order details */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading your order details…
        </div>
      )}

      {!loading && !fetchError && order && (
        <Card className="w-full text-left">
          <CardContent className="pt-6 flex flex-col gap-4">
            <h2 className="font-semibold text-base">Order Summary</h2>

            {/* Items */}
            {order.items && order.items.length > 0 && (
              <div className="flex flex-col divide-y">
                {order.items.map((item) => (
                  <div key={item.id} className="flex gap-3 py-3">
                    <div className="relative w-12 h-12 shrink-0 rounded-md overflow-hidden border bg-muted">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.product_title}
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center w-full h-full">
                          <ShoppingBag className="size-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-1 items-start justify-between gap-2 min-w-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium leading-tight truncate">
                          {item.product_title}
                        </p>
                        {item.variant_title && (
                          <p className="text-xs text-muted-foreground truncate">
                            {item.variant_title}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Qty: {item.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-medium shrink-0">
                        {formatPrice(item.total_price, order.currency)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="flex flex-col gap-2 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPrice(order.subtotal, order.currency)}</span>
              </div>

              {order.shipping_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Shipping</span>
                  <span>{formatPrice(order.shipping_amount, order.currency)}</span>
                </div>
              )}

              {order.discount_amount > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>
                    Discount
                    {order.coupon_code ? ` (${order.coupon_code})` : ""}
                  </span>
                  <span>-{formatPrice(order.discount_amount, order.currency)}</span>
                </div>
              )}

              {order.tax_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tax</span>
                  <span>{formatPrice(order.tax_amount, order.currency)}</span>
                </div>
              )}

              <div className="flex justify-between font-semibold text-base border-t pt-2 mt-1">
                <span>Total</span>
                <span>{formatPrice(order.total, order.currency)}</span>
              </div>
            </div>

            {/* Shipping address */}
            {order.shipping_address && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-1">Shipping to</p>
                <address className="text-sm text-muted-foreground not-italic leading-relaxed">
                  {order.shipping_address.recipient}
                  <br />
                  {order.shipping_address.line1}
                  {order.shipping_address.line2 && (
                    <>
                      <br />
                      {order.shipping_address.line2}
                    </>
                  )}
                  <br />
                  {[
                    order.shipping_address.city,
                    order.shipping_address.state,
                    order.shipping_address.postal_code,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  <br />
                  {order.shipping_address.country}
                </address>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-col items-center gap-3 w-full">
        <Button asChild size="lg" className="w-full sm:w-auto sm:px-12">
          <Link href="/shop">Continue Shopping</Link>
        </Button>

        {order?.tracking_number && (
          <p className="text-sm text-muted-foreground">
            Tracking:{" "}
            {order.tracking_url ? (
              <a
                href={order.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4 text-foreground hover:text-primary"
              >
                {order.tracking_number}
              </a>
            ) : (
              <span className="font-medium text-foreground">
                {order.tracking_number}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
