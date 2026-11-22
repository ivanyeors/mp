"use client";

import { useMemo } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { useCart } from "@/lib/shop/cart-context";
import { useCartStock } from "@/lib/shop/use-cart-stock";
import { buildCartMessages, type CartDictionary } from "@/lib/shop/cart-messages";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { CartEmptyState } from "@/components/shop/cart/cart-empty-state";
import { CartItemRow } from "@/components/shop/cart/cart-item-row";
import { CartShippingBar } from "@/components/shop/cart/cart-shipping-bar";
import { CartCouponField } from "@/components/shop/cart/cart-coupon-field";
import { CartSummary } from "@/components/shop/cart/cart-summary";
import { DeliveryEstimator } from "@/components/shop/delivery-estimator";
import { Button } from "@/components/ui/button";
import {
  MobileStickyActionBar,
  mobileStickyActionBarSpacerClassName,
} from "@/components/ui/mobile-sticky-action-bar";
import { cn } from "@/lib/utils";

interface CartPageClientProps {
  dictionary: CartDictionary;
  locale: Locale;
}

export function CartPageClient({ dictionary, locale }: CartPageClientProps) {
  const messages = useMemo(() => buildCartMessages(dictionary), [dictionary]);
  const {
    items,
    itemCount,
    subtotal,
    updateQuantity,
    removeItem,
    applyCoupon,
    couponCode,
    couponKind,
    couponPartnerName,
    couponError,
    couponDiscount,
    couponFreeShipping,
    couponValidating,
    hydrated,
  } = useCart();

  const shopHref = withLocale("/shop", locale);
  const checkoutHref = withLocale("/shop/checkout", locale);
  const currency = items[0]?.currency ?? "SGD";

  const { stock } = useCartStock(items, updateQuantity);

  const maxFor = (item: (typeof items)[number]): number | undefined =>
    item.customizationId ? undefined : stock[item.variantId];

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
      <div data-typography-scope="app" className="flex min-h-[50vh] flex-col">
        <CartEmptyState messages={messages} shopHref={shopHref} />
      </div>
    );
  }

  return (
    <div
      data-typography-scope="app"
      className={cn("relative mx-auto flex w-full max-w-5xl flex-col px-4 py-8", mobileStickyActionBarSpacerClassName, "md:pb-8")}
    >
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
          couponKind={couponKind}
          couponPartnerName={couponPartnerName}
          couponDiscount={couponDiscount}
          couponFreeShipping={couponFreeShipping}
          couponError={couponError}
          couponValidating={couponValidating}
          applyCoupon={applyCoupon}
          currency={currency}
          messages={messages}
        />
        <DeliveryEstimator
          locale={locale}
          items={items.map((item) => ({ variant_id: item.variantId, quantity: item.quantity }))}
          compact
          hideFreeThreshold
          className="rounded-lg border p-3"
        />
      </div>

      {hasShortage && (
        <p className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Some items exceed available stock. Adjust the quantities to continue.
        </p>
      )}

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
