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
      <SelectTrigger
        size="sm"
        aria-label="Currency"
        className="min-w-0 rounded-full [&>svg]:hidden"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" sheetTitle="Currency">
        {SUPPORTED_CURRENCIES.map((code) => {
          const config = CURRENCY_CONFIG[code];
          return (
            <SelectItem key={code} value={code} className="md:text-xs">
              {config.flag} {code}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
