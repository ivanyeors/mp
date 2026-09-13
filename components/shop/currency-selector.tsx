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

/**
 * Display-currency picker in the storefront header, styled as a pill like its
 * neighbours (`LanguageToggle`, `ModeToggle`). The shared `SelectTrigger` is
 * sized for a form field (`min-w-[12rem]`); on a phone that is wider than the
 * header column and slid the pill under the logo, so the trigger hugs its
 * content here.
 */
export function CurrencySelector() {
  const { currency, setCurrency } = useCurrency();

  return (
    <Select value={currency} onValueChange={(v) => setCurrency(v as SupportedCurrency)}>
      <SelectTrigger
        size="sm"
        aria-label="Currency"
        // `min-w-0` undoes the trigger's form-field minimum; `[&>svg]:hidden`
        // drops its built-in chevron, which the language pill beside it lacks
        // and which costs width on a phone.
        className="min-w-0 rounded-full [&>svg]:hidden"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" sheetTitle="Currency">
        {SUPPORTED_CURRENCIES.map((code) => {
          const config = CURRENCY_CONFIG[code];
          return (
            // Small text only in the desktop dropdown. The mobile sheet keeps
            // the shared text-base so each row stays a 44px tap target.
            <SelectItem key={code} value={code} className="md:text-xs">
              {config.flag} {code}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
