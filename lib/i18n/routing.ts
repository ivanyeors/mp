import { DEFAULT_LOCALE, isSupportedLocale, type Locale } from "@/lib/i18n/locales";

export function getLocaleFromPathname(pathname: string): Locale | null {
  const seg = pathname.split("/").filter(Boolean)[0];
  if (!seg) return null;
  return isSupportedLocale(seg) ? seg : null;
}

export function hasLocalePrefix(pathname: string): boolean {
  return getLocaleFromPathname(pathname) !== null;
}

export function stripLocale(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  if (isSupportedLocale(parts[0] ?? "")) {
    const rest = parts.slice(1);
    return rest.length ? `/${rest.join("/")}` : "/";
  }
  return pathname.startsWith("/") ? pathname : `/${pathname}`;
}

export function withLocale(pathname: string, locale: Locale): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const stripped = stripLocale(path);
  return stripped === "/" ? `/${locale}` : `/${locale}${stripped}`;
}

export function getLocaleOrDefault(pathname: string): Locale {
  return getLocaleFromPathname(pathname) ?? DEFAULT_LOCALE;
}

