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
