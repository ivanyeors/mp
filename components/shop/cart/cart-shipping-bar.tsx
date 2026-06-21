"use client";

import { Truck } from "lucide-react";
import { motion } from "motion/react";
import { formatPrice } from "@/components/shop/price-display";
import type { CartMessages } from "./cart-types";
import { FREE_SHIPPING_THRESHOLD } from "./cart-constants";

interface CartShippingBarProps {
  subtotal: number;
  currency: string;
  messages: CartMessages;
}

export function CartShippingBar({ subtotal, currency, messages }: CartShippingBarProps) {
  const shippingProgress = Math.min(subtotal / FREE_SHIPPING_THRESHOLD, 1);
  const amountToFreeShipping = FREE_SHIPPING_THRESHOLD - subtotal;
  const qualified = shippingProgress >= 1;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 text-xs">
        <Truck className="size-3.5 shrink-0 text-muted-foreground" />
        {qualified ? (
          <span className="font-medium text-green-600 dark:text-green-400">
            {messages.freeShippingQualified}
          </span>
        ) : (
          <span className="text-muted-foreground">
            {messages.freeShipping(formatPrice(amountToFreeShipping, currency))}
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
  );
}
