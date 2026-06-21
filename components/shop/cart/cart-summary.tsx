"use client";

import { PriceDisplay } from "@/components/shop/price-display";
import type { CartMessages } from "./cart-types";

interface CartSummaryProps {
  subtotal: number;
  currency: string;
  messages: CartMessages;
}

export function CartSummary({ subtotal, currency, messages }: CartSummaryProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{messages.subtotal}</span>
      <PriceDisplay price={subtotal} currency={currency} />
    </div>
  );
}
