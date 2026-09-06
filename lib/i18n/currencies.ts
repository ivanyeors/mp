export const SUPPORTED_CURRENCIES = ["SGD", "MYR", "USD", "CNY"] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const BASE_CURRENCY: SupportedCurrency = "SGD";
export const CURRENCY_COOKIE_NAME = "mp_currency";

export const CURRENCY_CONFIG: Record<
  SupportedCurrency,
  { symbol: string; locale: string; decimals: number; label: string; flag: string }
> = {
  SGD: { symbol: "S$", locale: "en-SG", decimals: 2, label: "SGD", flag: "\u{1F1F8}\u{1F1EC}" },
  MYR: { symbol: "RM", locale: "ms-MY", decimals: 2, label: "MYR", flag: "\u{1F1F2}\u{1F1FE}" },
  USD: { symbol: "$", locale: "en-US", decimals: 2, label: "USD", flag: "\u{1F1FA}\u{1F1F8}" },
  CNY: { symbol: "\u00A5", locale: "zh-CN", decimals: 2, label: "CNY", flag: "\u{1F1E8}\u{1F1F3}" },
};

export function isSupportedCurrency(code: string): code is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/**
 * Single money-formatting interface for the whole app. Defaults to the base
 * currency (SGD) so callers can omit the code for the common case. Unknown
 * codes still format via Intl, falling back to en-SG / 2 decimals.
 *
 * `display` picks between the localised symbol (`$1,234.50`) and the explicit
 * ISO code (`SGD 1,234.50`). Symbol is the default and is what every on-site
 * surface uses. Transactional email opts into `"code"`: an email is read out of
 * context, often days later, and Intl renders SGD in en-SG as a bare `$` that a
 * reader cannot tell from USD.
 */
export function formatCurrency(
  amount: number,
  currency: SupportedCurrency | string = BASE_CURRENCY,
  opts?: { display?: "symbol" | "code" }
): string {
  const config = CURRENCY_CONFIG[currency as SupportedCurrency];
  return new Intl.NumberFormat(config?.locale ?? "en-SG", {
    style: "currency",
    currency,
    currencyDisplay: opts?.display ?? "symbol",
    minimumFractionDigits: config?.decimals ?? 2,
    maximumFractionDigits: config?.decimals ?? 2,
  }).format(amount);
}
