"use client";

import { cn } from "@/lib/utils";

interface PriceDisplayProps {
  price: number;
  compareAtPrice?: number | null;
  currency?: string;
  className?: string;
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function PriceDisplay({
  price,
  compareAtPrice,
  currency = "MYR",
  className,
}: PriceDisplayProps) {
  const isOnSale = compareAtPrice != null && compareAtPrice > price;

  if (isOnSale) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
        <span className="text-muted-foreground line-through text-sm">
          {formatPrice(compareAtPrice!, currency)}
        </span>
        <span className="text-red-600 dark:text-red-400 font-semibold">
          {formatPrice(price, currency)}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("font-semibold", className)}>
      {formatPrice(price, currency)}
    </span>
  );
}
