"use client";

import { PriceDisplay, useDisplayPrice } from "@/components/shop/price-display";
import type { CartMessages } from "./cart-types";

interface CartSummaryProps {
  subtotal: number;
  couponDiscount: number;
  couponCode: string | null;
  currency: string;
  messages: CartMessages;
}

export function CartSummary({
  subtotal,
  couponDiscount,
  couponCode,
  currency,
  messages,
}: CartSummaryProps) {
  const displayPrice = useDisplayPrice();
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{messages.subtotal}</span>
        <PriceDisplay price={subtotal} currency={currency} />
      </div>
      {couponCode && couponDiscount > 0 && (
        <div className="flex items-center justify-between text-green-600 dark:text-green-400">
          <span>{messages.discount}</span>
          <span>-{displayPrice(couponDiscount, currency)}</span>
        </div>
      )}
    </div>
  );
}
