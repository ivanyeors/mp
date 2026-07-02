"use client";

import { PriceDisplay, formatPrice } from "@/components/shop/price-display";
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
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">{messages.subtotal}</span>
        <PriceDisplay price={subtotal} currency={currency} />
      </div>
      {couponCode && couponDiscount > 0 && (
        <div className="flex items-center justify-between text-green-600 dark:text-green-400">
          <span>{messages.discount}</span>
          <span>-{formatPrice(couponDiscount, currency)}</span>
        </div>
      )}
    </div>
  );
}
