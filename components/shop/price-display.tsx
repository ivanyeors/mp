"use client";

import { cn } from "@/lib/utils";
import { BASE_CURRENCY, formatCurrency } from "@/lib/i18n/currencies";

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

export function PriceDisplay({
  price,
  compareAtPrice,
  currency = "SGD",
  className,
  skipConversion,
}: PriceDisplayProps) {
  const ctx = useCurrency();

  const isOnSale = compareAtPrice != null && compareAtPrice > price;

  // Nothing to convert: asked not to, or already in the base currency.
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

/**
 * A price inside a sentence ("$30.00 away from free shipping"), by the same
 * rule as `PriceDisplay`: the amount as given while the shopper views the base
 * currency, else converted to the currency they picked and marked "~".
 * `formatPrice` below never converts, so a sentence built with it stayed in
 * SGD after the shopper switched currency.
 */
export function useDisplayPrice(): (amountInBase: number, currency?: string) => string {
  const { currency: displayCurrency, convertFromBase } = useCurrency();
  return (amountInBase, currency = BASE_CURRENCY) =>
    displayCurrency === BASE_CURRENCY
      ? formatAmount(amountInBase, currency)
      : `~${formatAmount(convertFromBase(amountInBase), displayCurrency)}`;
}

/** Standalone format function for use outside React components. Never converts: for a shopper-facing price use `PriceDisplay` or `useDisplayPrice`. */
export function formatPrice(amount: number, currency: string): string {
  return formatAmount(amount, currency);
}
