"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrency, SUPPORTED_CURRENCIES, CURRENCY_CONFIG } from "@/lib/shop/currency-context";
import type { SupportedCurrency } from "@/lib/i18n/currencies";

export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();

  return (
    <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
      <SelectTrigger className="h-8 w-[90px] text-xs gap-1 border-none bg-transparent hover:bg-accent/50 focus:ring-0 focus:ring-offset-0">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {SUPPORTED_CURRENCIES.map((code) => {
          const config = CURRENCY_CONFIG[code];
          return (
            <SelectItem key={code} value={code} className="text-xs">
              {config.flag} {code}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
