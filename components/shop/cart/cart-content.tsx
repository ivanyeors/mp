"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { CartItemClient } from "@/lib/types/ecommerce";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { useCartStock } from "@/lib/shop/use-cart-stock";
import { Button } from "@/components/ui/button";
import type { CartMessages, CartVariant } from "./cart-types";
import { CartEmptyState } from "./cart-empty-state";
import { CartItemRow } from "./cart-item-row";
import { CartShippingBar } from "./cart-shipping-bar";
import { CartCouponField } from "./cart-coupon-field";
import { CartSummary } from "./cart-summary";

interface CartContentProps {
  variant: CartVariant;
  messages: CartMessages;
  locale: Locale;
  subtotal: number;
  couponDiscount: number;
  couponFreeShipping: boolean;
  items: CartItemClient[];
  couponCode: string | null;
  couponKind: "discount" | "referral" | null;
  couponPartnerName: string | null;
  couponError: string | null;
  couponValidating: boolean;
  applyCoupon: (code: string | null) => Promise<void>;
  updateQuantity: (variantId: string, quantity: number, customizationId?: string) => void;
  removeItem: (variantId: string, customizationId?: string) => void;
  onClose?: () => void;
  shopHref: string;
  checkoutHref: string;
}

export function CartContent({
  variant,
  messages,
  locale,
  subtotal,
  couponDiscount,
  couponFreeShipping,
  items,
  couponCode,
  couponKind,
  couponPartnerName,
  couponError,
  couponValidating,
  applyCoupon,
  updateQuantity,
  removeItem,
  onClose,
  shopHref,
  checkoutHref,
}: CartContentProps) {
  const currency = items[0]?.currency ?? "SGD";
  const handleNavigate = onClose;

  const standardVariantIds = items
    .filter((i) => !i.customizationId)
    .map((i) => i.variantId);
  const { stock } = useCartStock(standardVariantIds);

  const maxFor = (item: CartItemClient): number | undefined =>
    item.customizationId ? undefined : stock[item.variantId];

  useEffect(() => {
    for (const item of items) {
      const max = maxFor(item);
      if (max != null && max > 0 && item.quantity > max) {
        updateQuantity(item.variantId, max, item.customizationId);
      }
    }
  }, [stock]);

  const hasShortage = items.some((item) => {
    const max = maxFor(item);
    return max != null && (max <= 0 || item.quantity > max);
  });

  return (
    <AnimatePresence mode="wait">
      {items.length === 0 ? (
        <CartEmptyState
          messages={messages}
          shopHref={shopHref}
          onNavigate={handleNavigate}
        />
      ) : (
        <motion.div
          key="items"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={
            variant === "popover"
              ? "flex h-full min-h-0 flex-col overflow-hidden"
              : "flex flex-1 flex-col overflow-hidden"
          }
        >
          <div className="flex-1 overflow-y-auto divide-y">
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
                  onNavigate={handleNavigate}
                  variant={variant}
                  maxQuantity={maxFor(item)}
                />
              ))}
            </AnimatePresence>
          </div>

          <div className="border-t bg-background px-4 py-4 flex flex-col gap-3">
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
            <CartSummary
              subtotal={subtotal}
              couponDiscount={couponDiscount}
              couponCode={couponCode}
              currency={currency}
              messages={messages}
            />
            {hasShortage && (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                Some items exceed available stock. Adjust quantities to continue.
              </p>
            )}
            {hasShortage ? (
              <Button className="w-full" size="lg" disabled>
                {messages.proceedToCheckout}
              </Button>
            ) : (
              <Button asChild className="w-full" size="lg">
                <Link href={checkoutHref} onClick={handleNavigate}>
                  {messages.proceedToCheckout}
                </Link>
              </Button>
            )}
            {onClose ? (
              <button
                type="button"
                onClick={onClose}
                className="max-md:min-h-11 text-sm text-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
              >
                {messages.continueShopping}
              </button>
            ) : (
              <Button asChild variant="link" className="text-sm">
                <Link href={shopHref}>{messages.continueShopping}</Link>
              </Button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
