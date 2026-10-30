import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

/** Locale-prefixed absolute URL, e.g. https://custom.mpillow.com/en-US/shop/foo */
export function localeUrl(lang: string, path = ""): string {
  const normalized = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${getSiteOrigin()}/${lang}${normalized}`;
}

/** Of the locales a page exists in, the one that stands for it: the default locale when it is one of them. */
export function primaryLocale(locales: readonly string[] = SUPPORTED_LOCALES): string | undefined {
  return locales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locales[0];
}

/** hreflang map for `locales` (all supported by default), plus `x-default` on the primary locale. */
export function localeAlternates(path = "", locales: readonly string[] = SUPPORTED_LOCALES): Record<string, string> {
  const out: Record<string, string> = {};
  for (const locale of locales) {
    out[locale] = localeUrl(locale, path);
  }
  const fallback = primaryLocale(locales);
  if (fallback) out["x-default"] = localeUrl(fallback, path);
  return out;
}

export function resolveLocale(lang: string): Locale {
  return SUPPORTED_LOCALES.includes(lang as Locale) ? (lang as Locale) : DEFAULT_LOCALE;
}
