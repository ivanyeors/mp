import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";

const CURRENCY_COOKIE = "mp_currency";
// Retired shared-OTP admin session cookie (#39). Cleared on next navigation so
// any previously-issued shared session cannot linger in browsers.
const LEGACY_SETTINGS_SESSION_COOKIE = "mp_settings_session";

function clearLegacySettingsSession(request: NextRequest, response: NextResponse) {
  if (request.cookies.get(LEGACY_SETTINGS_SESSION_COOKIE)) {
    response.cookies.set(LEGACY_SETTINGS_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  }
}

function detectCurrencyFromAcceptLanguage(headerValue: string): string | null {
  const lowered = headerValue.toLowerCase();
  if (lowered.includes("zh")) return "CNY";
  if (lowered.includes("ms") || lowered.includes("my")) return "MYR";
  // Default to SGD for en and all other languages — no cookie needed
  return null;
}

function pickLocaleFromAcceptLanguage(headerValue: string | null): Locale {
  if (!headerValue) return DEFAULT_LOCALE;

  // Very small matcher for our supported locales (en-US, zh-CN).
  // Example: "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7"
  const lowered = headerValue.toLowerCase();
  if (lowered.includes("zh")) return "zh-CN";
  if (lowered.includes("en")) return "en-US";
  return DEFAULT_LOCALE;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip Next internals, API, auth callback, and direct file requests.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/auth") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const pathLocale = getLocaleFromPathname(pathname);

  // If the URL already has a locale, keep it and ensure cookie matches.
  if (pathLocale) {
    // ponytail: middleware redirects beat stale static caches for moved settings routes
    if (pathname.endsWith("/settings/inventory/shopify")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace("/settings/inventory/shopify", "/settings/integrations/shopify");
      return NextResponse.redirect(url, 308);
    }
    if (pathname.endsWith("/settings/categories")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace("/settings/categories", "/settings/products");
      return NextResponse.redirect(url, 308);
    }

    const res = NextResponse.next();
    clearLegacySettingsSession(request, res);
    const existing = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
    if (existing !== pathLocale) {
      res.cookies.set(LOCALE_COOKIE_NAME, pathLocale, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
      });
    }
    // Auto-set currency cookie based on locale if not already set
    if (!request.cookies.get(CURRENCY_COOKIE)?.value) {
      const acceptLang = request.headers.get("accept-language") ?? "";
      const detectedCurrency = detectCurrencyFromAcceptLanguage(acceptLang);
      if (detectedCurrency) {
        res.cookies.set(CURRENCY_COOKIE, detectedCurrency, {
          path: "/",
          maxAge: 60 * 60 * 24 * 365,
          sameSite: "lax",
        });
      }
    }
    // Refresh the Supabase auth session (rotates cookies onto the response).
    await refreshSupabaseSession(request, res);
    return res;
  }

  const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
  const preferredLocale = isSupportedLocale(cookieLocale ?? "")
    ? (cookieLocale as Locale)
    : pickLocaleFromAcceptLanguage(request.headers.get("accept-language"));

  const url = request.nextUrl.clone();
  url.pathname = withLocale(pathname, preferredLocale);

  const res = NextResponse.redirect(url);
  clearLegacySettingsSession(request, res);
  res.cookies.set(LOCALE_COOKIE_NAME, preferredLocale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}

export const config = {
  matcher: ["/((?!api|_next|auth|favicon.ico|manifest.webmanifest|stripe-test).*)"],
};

