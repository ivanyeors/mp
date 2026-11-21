"use client";

import { cn } from "@/lib/utils";
import { BASE_CURRENCY, formatCurrency } from "@/lib/i18n/currencies";

import { useCurrency } from "@/lib/shop/currency-context";

interface PriceDisplayProps {
  price: number;
  compareAtPrice?: number | null;
  currency?: string;
  className?: string;
  skipConversion?: boolean;
}

function formatAmount(amount: number, currency: string): string {
  return formatCurrency(amount, currency);
}

export function PriceDisplay({
  price,
  compareAtPrice,
  currency = "SGD",
  className,
  skipConversion,
}: PriceDisplayProps) {
  const ctx = useCurrency();

  const isOnSale = compareAtPrice != null && compareAtPrice > price;

  if (skipConversion || ctx.currency === BASE_CURRENCY) {
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

export function useDisplayPrice(): (amountInBase: number, currency?: string) => string {
  const { currency: displayCurrency, convertFromBase } = useCurrency();
  return (amountInBase, currency = BASE_CURRENCY) =>
    displayCurrency === BASE_CURRENCY
      ? formatAmount(amountInBase, currency)
      : `~${formatAmount(convertFromBase(amountInBase), displayCurrency)}`;
}

export function formatPrice(amount: number, currency: string): string {
  return formatAmount(amount, currency);
}
