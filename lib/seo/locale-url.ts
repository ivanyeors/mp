import { getSiteOrigin } from "@/lib/site-url";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

export function localeUrl(lang: string, path = ""): string {
  const normalized = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${getSiteOrigin()}/${lang}${normalized}`;
}

export function primaryLocale(locales: readonly string[] = SUPPORTED_LOCALES): string | undefined {
  return locales.includes(DEFAULT_LOCALE) ? DEFAULT_LOCALE : locales[0];
}

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
