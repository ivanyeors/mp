import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

export interface ProductLocale {
  code: Locale;
  label: string;
  short: string;
  language: string;
  counts: "words" | "characters";
}

const LOCALE_DETAILS: Record<Locale, Omit<ProductLocale, "code">> = {
  "en-US": { label: "English", short: "EN", language: "English, as Singapore writes it, with British spelling", counts: "words" },
  "zh-CN": { label: "中文", short: "ZH", language: "Simplified Chinese, as our Chinese website writes it for readers in Singapore", counts: "characters" },
};

export const PRODUCT_LOCALES: readonly ProductLocale[] = SUPPORTED_LOCALES.map((code) => ({ code, ...LOCALE_DETAILS[code] }));

export const PRODUCT_SOURCE_LOCALE: Locale = DEFAULT_LOCALE;

export function productLocale(code: Locale): ProductLocale {
  return PRODUCT_LOCALES.find((l) => l.code === code) ?? PRODUCT_LOCALES[0];
}
