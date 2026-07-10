import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

/** Locale-prefixed absolute URL, e.g. https://custom.mpillow.com/en-US/shop/foo */
export function localeUrl(lang: string, path = ""): string {
  const normalized = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${getSiteOrigin()}/${lang}${normalized}`;
}

export function localeAlternates(path = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of SUPPORTED_LOCALES) {
    out[locale] = localeUrl(locale, path);
  }
  return out;
}

export function resolveLocale(lang: string): Locale {
  return SUPPORTED_LOCALES.includes(lang as Locale) ? (lang as Locale) : DEFAULT_LOCALE;
}
