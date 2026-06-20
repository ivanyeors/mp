"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { ShoppingBag, Trash2, X, Truck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCart } from "@/lib/shop/cart-context";
import { QuantitySelector } from "@/components/shop/quantity-selector";
import { PriceDisplay } from "@/components/shop/price-display";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";

const FREE_SHIPPING_THRESHOLD = 150;

export function CartDrawer() {
  const { items, isOpen, toggleCart, itemCount, subtotal, updateQuantity, removeItem, applyCoupon, couponCode } =
    useCart();

  const [couponInput, setCouponInput] = useState(couponCode ?? "");
  const [couponApplied, setCouponApplied] = useState(false);

  function handleApplyCoupon() {
    const trimmed = couponInput.trim();
    if (trimmed) {
      applyCoupon(trimmed);
      setCouponApplied(true);
    } else {
      applyCoupon(null);
      setCouponApplied(false);
    }
  }

  // Currency from first item, fallback to SGD
  const currency = items[0]?.currency ?? "SGD";
  const shippingProgress = Math.min(subtotal / FREE_SHIPPING_THRESHOLD, 1);
  const amountToFreeShipping = FREE_SHIPPING_THRESHOLD - subtotal;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => toggleCart(open)}>
      <SheetContent
        side="right"
        hideClose
        mobilePreset="full"
        className="flex flex-col w-full sm:max-w-md p-0 gap-0"
      >
        {/* Header */}
        <SheetHeader className="flex-row items-center justify-between border-b px-4 py-4 gap-0">
          <SheetTitle className="text-base font-semibold">
            Cart
            {itemCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground text-xs w-5 h-5 font-medium">
                {itemCount}
              </span>
            )}
          </SheetTitle>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close cart"
            onClick={() => toggleCart(false)}
            className="shrink-0 -mr-1"
          >
            <X className="size-5" />
          </Button>
        </SheetHeader>

        {/* Body */}
        <AnimatePresence mode="wait">
          {items.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center"
            >
              <div className="rounded-full bg-muted p-6">
                <ShoppingBag className="size-10 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium text-base">Your cart is empty</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add items to get started
                </p>
              </div>
              <Button asChild variant="outline" onClick={() => toggleCart(false)}>
                <Link href="/shop">Continue Shopping</Link>
              </Button>
            </motion.div>
          ) : (
            <motion.div
              key="items"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-1 flex-col overflow-hidden"
            >
              {/* Items list */}
              <div className="flex-1 overflow-y-auto divide-y">
                <AnimatePresence initial={false}>
                  {items.map((item) => (
                    <motion.div
                      key={item.variantId + (item.customizationId ?? "")}
                      layout
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0, transition: { duration: 0.2 } }}
                      className="flex gap-3 px-4 py-4"
                    >
                      {/* Thumbnail */}
                      <div className="shrink-0 rounded-md overflow-hidden bg-muted border w-16 h-16 relative">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.productTitle}
                            fill
                            className="object-cover"
                            sizes="64px"
                          />
                        ) : (
                          <div className="flex items-center justify-center w-full h-full">
                            <ShoppingBag className="size-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex flex-1 flex-col gap-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link
                              href={`/shop/products/${item.productSlug}`}
                              className="text-sm font-medium leading-tight hover:underline line-clamp-2"
                              onClick={() => toggleCart(false)}
                            >
                              {item.productTitle}
                            </Link>
                            {item.variantTitle && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {item.variantTitle}
                              </p>
                            )}
                            {item.customizationSummary && (
                              <p className="text-xs text-muted-foreground mt-0.5">{item.customizationSummary}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove ${item.productTitle}`}
                            onClick={() => removeItem(item.variantId, item.customizationId)}
                            className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>

                        <div className="flex items-center justify-between mt-auto">
                          <QuantitySelector
                            value={item.quantity}
                            onChange={(qty) => updateQuantity(item.variantId, qty, item.customizationId)}
                            min={1}
                            className="h-8"
                          />
                          <div className="text-right">
                            <PriceDisplay
                              price={(item.price + (item.addonPrice ?? 0)) * item.quantity}
                              currency={item.currency}
                              className="text-sm"
                            />
                            {(item.addonPrice ?? 0) > 0 && (
                              <p className="text-xs text-muted-foreground">
                                +<PriceDisplay price={item.addonPrice!} currency={item.currency} className="inline text-xs" /> customization
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <SheetFooter className="border-t bg-background px-4 py-4 gap-3 mt-0">
                {/* Free shipping progress */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <Truck className="size-3.5 shrink-0 text-muted-foreground" />
                    {shippingProgress >= 1 ? (
                      <span className="font-medium text-green-600 dark:text-green-400">
                        You qualify for free shipping!
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        <PriceDisplay price={amountToFreeShipping} currency={currency} className="inline text-xs font-medium text-foreground" /> away from free shipping
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-primary"
                      initial={{ width: 0 }}
                      animate={{ width: `${shippingProgress * 100}%` }}
                      transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    />
                  </div>
                </div>

                {/* Coupon */}
                <div className="flex gap-2">
                  <Input
                    placeholder="Coupon code"
                    value={couponInput}
                    onChange={(e) => {
                      setCouponInput(e.target.value);
                      setCouponApplied(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyCoupon();
                    }}
                    className="h-9 text-sm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleApplyCoupon}
                    className="shrink-0 h-9"
                  >
                    Apply
                  </Button>
                </div>
                {couponApplied && couponCode && (
                  <p className="text-xs text-green-600 dark:text-green-400 -mt-1">
                    Coupon &quot;{couponCode}&quot; applied!
                  </p>
                )}

                {/* Subtotal */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <PriceDisplay price={subtotal} currency={currency} />
                </div>

                {/* Proceed */}
                <Button asChild className="w-full" size="lg">
                  <Link href="/shop/checkout" onClick={() => toggleCart(false)}>
                    Proceed to Checkout
                  </Link>
                </Button>

                {/* Continue shopping */}
                <button
                  type="button"
                  onClick={() => toggleCart(false)}
                  className="text-sm text-center text-muted-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline"
                >
                  Continue Shopping
                </button>
              </SheetFooter>
            </motion.div>
          )}
        </AnimatePresence>
      </SheetContent>
    </Sheet>
  );
}
