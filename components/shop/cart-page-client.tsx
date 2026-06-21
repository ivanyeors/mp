"use client";

import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useCart } from "@/lib/shop/cart-context";
import type { CartMessages } from "@/components/shop/cart/cart-types";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { CartEmptyState } from "@/components/shop/cart/cart-empty-state";
import { CartItemRow } from "@/components/shop/cart/cart-item-row";
import { CartShippingBar } from "@/components/shop/cart/cart-shipping-bar";
import { CartCouponField } from "@/components/shop/cart/cart-coupon-field";
import { CartSummary } from "@/components/shop/cart/cart-summary";
import { Button } from "@/components/ui/button";

interface CartPageClientProps {
  messages: CartMessages;
  locale: Locale;
}

export function CartPageClient({ messages, locale }: CartPageClientProps) {
  const {
    items,
    itemCount,
    subtotal,
    updateQuantity,
    removeItem,
    applyCoupon,
    couponCode,
    hydrated,
  } = useCart();

  const shopHref = withLocale("/shop", locale);
  const checkoutHref = withLocale("/shop/checkout", locale);
  const currency = items[0]?.currency ?? "SGD";

  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="size-8 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[50vh] flex-col">
        <CartEmptyState messages={messages} shopHref={shopHref} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col pb-[calc(var(--mobile-bottom-clearance)+7rem+env(safe-area-inset-bottom,0px))] md:pb-0">
      <div className="mb-4 flex items-center gap-2">
        <h1 className="text-2xl font-bold tracking-tight">{messages.title}</h1>
        {itemCount > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs min-w-5 h-5 px-1.5 font-medium">
            {itemCount}
          </span>
        )}
      </div>

      <div className="divide-y rounded-lg border bg-card">
        <AnimatePresence initial={false}>
          {items.map((item) => (
            <CartItemRow
              key={item.variantId + (item.customizationId ?? "")}
              item={item}
              messages={messages}
              productHref={withLocale(`/shop/${item.productSlug}`, locale)}
              onRemove={() => removeItem(item.variantId, item.customizationId)}
              onQuantityChange={(qty) =>
                updateQuantity(item.variantId, qty, item.customizationId)
              }
              variant="page"
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-6 space-y-4 px-1">
        <CartShippingBar subtotal={subtotal} currency={currency} messages={messages} />
        <CartCouponField
          couponCode={couponCode}
          applyCoupon={applyCoupon}
          messages={messages}
        />
      </div>

      {/* Desktop inline footer */}
      <div className="mt-6 hidden flex-col gap-3 md:flex">
        <CartSummary subtotal={subtotal} currency={currency} messages={messages} />
        <Button asChild className="w-full max-w-sm" size="lg">
          <Link href={checkoutHref}>{messages.proceedToCheckout}</Link>
        </Button>
        <Button asChild variant="link" className="w-fit text-sm">
          <Link href={shopHref}>{messages.continueShopping}</Link>
        </Button>
      </div>

      {/* Mobile sticky checkout bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden">
        <div className="mx-auto max-w-7xl px-4 py-3 pb-[calc(var(--mobile-bottom-clearance)+env(safe-area-inset-bottom,0px))]">
          <CartSummary subtotal={subtotal} currency={currency} messages={messages} />
          <Button asChild className="mt-3 w-full" size="lg">
            <Link href={checkoutHref}>{messages.proceedToCheckout}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
