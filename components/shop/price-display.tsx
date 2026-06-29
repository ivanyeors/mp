"use client";

import { useContext } from "react";
import { cn } from "@/lib/utils";
import { BASE_CURRENCY, formatCurrency } from "@/lib/i18n/currencies";

// We import the context directly to avoid a hard dependency — PriceDisplay
// can work without the CurrencyProvider (falls back to base currency formatting).
import { useCurrency } from "@/lib/shop/currency-context";

interface PriceDisplayProps {
  /** Price in the base currency (SGD) */
  price: number;
  compareAtPrice?: number | null;
  currency?: string;
  className?: string;
  /** If true, skip currency conversion and show the raw amount in the given currency */
  skipConversion?: boolean;
}

function formatAmount(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

function useCurrencySafe() {
  try {
    return useCurrency();
  } catch {
    return null;
  }
}

export function PriceDisplay({
  price,
  compareAtPrice,
  currency = "SGD",
  className,
  skipConversion,
}: PriceDisplayProps) {
  const ctx = useCurrencySafe();

  const isOnSale = compareAtPrice != null && compareAtPrice > price;

  // If no currency context or skipConversion, format in the provided currency
  if (!ctx || skipConversion || ctx.currency === BASE_CURRENCY) {
    if (isOnSale) {
      return (
        <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
          <span className="text-muted-foreground line-through text-sm">
            {formatAmount(compareAtPrice!, currency)}
          </span>
          <span className="text-red-600 dark:text-red-400 font-semibold">
            {formatAmount(price, currency)}
          </span>
        </span>
      );
    }

    return (
      <span className={cn("font-semibold", className)}>
        {formatAmount(price, currency)}
      </span>
    );
  }

  // Convert from base currency to display currency
  const displayCurrency = ctx.currency;
  const convertedPrice = ctx.convertFromBase(price);
  const convertedCompare = compareAtPrice != null ? ctx.convertFromBase(compareAtPrice) : null;
  const isConvertedSale = convertedCompare != null && convertedCompare > convertedPrice;
  const prefix = "~";

  if (isConvertedSale) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
        <span className="text-muted-foreground line-through text-sm">
          {prefix}{formatAmount(convertedCompare!, displayCurrency)}
        </span>
        <span className="text-red-600 dark:text-red-400 font-semibold">
          {prefix}{formatAmount(convertedPrice, displayCurrency)}
        </span>
      </span>
    );
  }

  return (
    <span className={cn("font-semibold", className)}>
      {prefix}{formatAmount(convertedPrice, displayCurrency)}
    </span>
  );
}

/** Standalone format function for use outside React components */
export function formatPrice(amount: number, currency: string): string {
  return formatAmount(amount, currency);
}
