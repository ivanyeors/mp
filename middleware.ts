import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";

function pickLocaleFromAcceptLanguage(headerValue: string | null): Locale {
  if (!headerValue) return DEFAULT_LOCALE;

  // Very small matcher for our supported locales (en-US, zh-CN).
  // Example: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"
  const lowered = headerValue.toLowerCase();
  if (lowered.includes("zh")) return "zh-CN";
  if (lowered.includes("en")) return "en-US";
  return DEFAULT_LOCALE;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next internals, API, and direct file requests.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const pathLocale = getLocaleFromPathname(pathname);

  // If the URL already has a locale, keep it and ensure cookie matches.
  if (pathLocale) {
    const res = NextResponse.next();
    const existing = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
    if (existing !== pathLocale) {
      res.cookies.set(LOCALE_COOKIE_NAME, pathLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
      });
    }
    return res;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const preferredLocale = isSupportedLocale(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : pickLocaleFromAcceptLanguage(request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = withLocale(pathname, preferredLocale);

  const res = NextResponse.redirect(url);
  res.cookies.set(LOCALE_COOKIE_NAME, preferredLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|favicon.ico|manifest.webmanifest).*)"],
};

