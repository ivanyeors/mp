"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useCart } from "@/lib/shop/cart-context";
import { useCartStock } from "@/lib/shop/use-cart-stock";
import type { CartMessages } from "@/components/shop/cart/cart-types";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { CartEmptyState } from "@/components/shop/cart/cart-empty-state";
import { CartItemRow } from "@/components/shop/cart/cart-item-row";
import { CartShippingBar } from "@/components/shop/cart/cart-shipping-bar";
import { CartCouponField } from "@/components/shop/cart/cart-coupon-field";
import { CartSummary } from "@/components/shop/cart/cart-summary";
import { Button } from "@/components/ui/button";
import {
  MobileStickyActionBar,
  mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";
import { cn } from "@/lib/utils";

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
    couponError,
    couponDiscount,
    couponFreeShipping,
    couponValidating,
    hydrated,
  } = useCart();

  const shopHref = withLocale("/shop", locale);
  const checkoutHref = withLocale("/shop/checkout", locale);
  const currency = items[0]?.currency ?? "SGD";

  // Live availability for standard (non-customized) items. Customized items are
  // validated against their component BOM at checkout, so they are not capped here.
  const standardVariantIds = items
    .filter((i) => !i.customizationId)
    .map((i) => i.variantId);
  const { stock } = useCartStock(standardVariantIds);

  const maxFor = (item: (typeof items)[number]): number | undefined =>
    item.customizationId ? undefined : stock[item.variantId];

  // Auto-clamp any quantity that now exceeds live availability (stock may have
  // dropped after the item was added to the cart).
  useEffect(() => {
    for (const item of items) {
      const max = maxFor(item);
      if (max != null && max > 0 && item.quantity > max) {
        updateQuantity(item.variantId, max, item.customizationId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock]);

  const hasShortage = items.some((item) => {
    const max = maxFor(item);
    return max != null && (max <= 0 || item.quantity > max);
  });

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
    <div className={cn("relative mx-auto flex w-full max-w-5xl flex-col px-4 py-8", mobileStickyActionBarSpacerClassName, "md:pb-8")}>
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
              maxQuantity={maxFor(item)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="mt-6 space-y-4 px-1">
        <CartShippingBar subtotal={subtotal} currency={currency} messages={messages} />
        <CartCouponField
          couponCode={couponCode}
          couponDiscount={couponDiscount}
          couponFreeShipping={couponFreeShipping}
          couponError={couponError}
          couponValidating={couponValidating}
          applyCoupon={applyCoupon}
          currency={currency}
          messages={messages}
        />
      </div>

      {hasShortage && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Some items exceed available stock. Adjust the quantities to continue.
        </p>
      )}

      {/* Desktop inline footer */}
      <div className="mt-6 hidden flex-col gap-3 md:flex">
        <CartSummary
          subtotal={subtotal}
          couponDiscount={couponDiscount}
          couponCode={couponCode}
          currency={currency}
          messages={messages}
        />
        {hasShortage ? (
          <Button className="w-full max-w-sm" size="lg" disabled>
            {messages.proceedToCheckout}
          </Button>
        ) : (
          <Button asChild className="w-full max-w-sm" size="lg">
            <Link href={checkoutHref}>{messages.proceedToCheckout}</Link>
          </Button>
        )}
        <Button asChild variant="link" className="w-fit text-sm">
          <Link href={shopHref}>{messages.continueShopping}</Link>
        </Button>
      </div>

      {/* Mobile sticky checkout bar */}
      <MobileStickyActionBar>
        <CartSummary
          subtotal={subtotal}
          couponDiscount={couponDiscount}
          couponCode={couponCode}
          currency={currency}
          messages={messages}
        />
        {hasShortage ? (
          <Button className="mt-3 w-full" size="lg" disabled>
            {messages.proceedToCheckout}
          </Button>
        ) : (
          <Button asChild className="mt-3 w-full" size="lg">
            <Link href={checkoutHref}>{messages.proceedToCheckout}</Link>
          </Button>
        )}
      </MobileStickyActionBar>
    </div>
  );
}
