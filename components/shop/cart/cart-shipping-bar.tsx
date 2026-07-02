"use client";

import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import { motion } from "motion/react";
import { formatPrice } from "@/components/shop/price-display";
import type { CartMessages } from "./cart-types";

interface CartShippingBarProps {
  subtotal: number;
  currency: string;
  messages: CartMessages;
  country?: string;
}

export function CartShippingBar({
  subtotal,
  currency,
  messages,
  country = "SG",
}: CartShippingBarProps) {
  const [freeAbove, setFreeAbove] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/shop/shipping?country=${country}`)
      .then((res) => res.json())
      .then((json) => {
        const rows = (json.rows ?? []).filter(
          (m: { is_active?: boolean }) => m.is_active !== false
        );
        const thresholds = rows
          .map((m: { free_above: number | null }) => m.free_above)
          .filter((v: number | null): v is number => v != null);
        setFreeAbove(thresholds.length > 0 ? Math.min(...thresholds) : null);
      })
      .catch(() => setFreeAbove(null));
  }, [country]);

  if (freeAbove == null) return null;

  const shippingProgress = Math.min(subtotal / freeAbove, 1);
  const amountToFreeShipping = freeAbove - subtotal;
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
