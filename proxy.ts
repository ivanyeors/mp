import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { classifyCrawler, recordCrawlerHit } from "@/lib/analytics/ai-crawlers";
import { isCrossSiteWrite } from "@/lib/auth/cross-site";
import { blogSlugFate } from "@/lib/blog-redirects";
import { recordCampaignClick, stripClickToken } from "@/lib/email-campaigns/click";
import { FONT_STACK } from "@/lib/font-stack";
import { DEFAULT_LOCALE, isSupportedLocale, LOCALE_COOKIE_NAME, type Locale } from "@/lib/i18n/locales";
import { getLocaleFromPathname, withLocale } from "@/lib/i18n/routing";
import { refreshSupabaseSession } from "@/lib/supabase/middleware";
import { supabaseAdmin } from "@/lib/supabase/server";

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

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

function blogGoneResponse(locale: Locale): NextResponse {
  const blog = withLocale("/blog", locale);
  const html = `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>This article has been removed | Mpillow</title></head><body style="font-family:${FONT_STACK};max-width:36rem;margin:15vh auto;padding:0 1rem;line-height:1.5"><h1>This article has been removed</h1><p>It is no longer part of the Mpillow blog.</p><p><a href="${blog}">Browse the blog</a></p></body></html>`;
  return new NextResponse(html, { status: 410, headers: { "content-type": "text/html; charset=utf-8" } });
}

const LEGACY_HOST = "work.mpillow.com";
const CANONICAL_ORIGIN = "https://custom.mpillow.com";

export async function proxy(request: NextRequest, event: NextFetchEvent) {
  const { pathname } = request.nextUrl;

  // API: refuse a cookie-authenticated write from another origin, and nothing
  // else — no crawler counting, host redirect or locale work (lib/auth/cross-site.ts).
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    if (isCrossSiteWrite(request, pathname)) {
      return NextResponse.json({ error: "Cross-site request refused" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // AI crawler hits (PRD-search-visibility slice 04). Before the static-file
  // skip so /llms.txt and /robots.txt count; recorded after the response via
  // waitUntil, so a slow or failing write never delays or breaks the request.
  const crawler = classifyCrawler(request.headers.get("user-agent"));
  if (crawler && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    event.waitUntil(recordCrawlerHit(supabaseAdmin(), crawler, pathname));
  }

  // Domain migration: proxy runs before next.config redirects, so host
  // cutover must live here or locale 307 wins and work. never 301s.
  const host = request.headers.get("host")?.split(":")[0]?.toLowerCase();
  if (host === LEGACY_HOST) {
    const dest = new URL(pathname + request.nextUrl.search, CANONICAL_ORIGIN);
    return NextResponse.redirect(dest, 301);
  }

  // Skip Next internals, auth callback, dev tooling, and direct file requests.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/auth") ||
    // Exact segment, not a prefix — a future /developers page must still get
    // normal locale handling.
    pathname === "/dev" ||
    pathname.startsWith("/dev/") ||
    // Short redirects (app/r): the review link is one hop to Google, with no
    // locale bounce or cookie (CRM slice 07).
    pathname.startsWith("/r/") ||
    pathname === "/favicon.ico" ||
    pathname === "/manifest.webmanifest" ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // A campaign email's link (PRD-campaign-audiences slice 08): take the click
  // token off before anything renders, so it never reaches analytics, a
  // shared link or a screenshot, and count the click after the response. Only
  // a person's GET counts: a HEAD, or a known crawler, is redirected and not
  // counted, and the SQL skips a click within 10 seconds of the send. The
  // token is never logged and identifies nobody.
  const clicked = stripClickToken(request.nextUrl);
  if (clicked) {
    if (request.method === "GET" && !crawler && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      event.waitUntil(recordCampaignClick(supabaseAdmin(), clicked.token));
    }
    const res = NextResponse.redirect(clicked.cleanUrl, 302);
    res.headers.set("Cache-Control", "no-store");
    res.headers.set("Referrer-Policy", "no-referrer");
    return res;
  }

  const pathLocale = getLocaleFromPathname(pathname);

  // If the URL already has a locale, keep it and ensure cookie matches.
  if (pathLocale) {
    // ponytail: proxy redirects beat stale static caches for moved settings routes
    if (pathname.endsWith("/settings/inventory/shopify")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace("/settings/inventory/shopify", "/settings/integrations/shopify");
      return NextResponse.redirect(url, 308);
    }
    if (pathname.endsWith("/settings/integrations/easyship")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace("/settings/integrations/easyship", "/settings/shipping/couriers");
      return NextResponse.redirect(url, 308);
    }
    if (pathname.endsWith("/settings/categories")) {
      const url = request.nextUrl.clone();
      url.pathname = pathname.replace("/settings/categories", "/settings/products");
      return NextResponse.redirect(url, 308);
    }

    // Consolidated blog posts (content-audit.md): merged → the post that absorbed them, retired → 410.
    const blogSlug = pathname.match(/^\/[^/]+\/blog\/([^/]+)\/?$/)?.[1];
    const fate = blogSlug ? blogSlugFate(safeDecode(blogSlug)) : null;
    if (fate?.kind === "merged") {
      const url = request.nextUrl.clone();
      url.pathname = withLocale(`/blog/${fate.into}`, pathLocale);
      return NextResponse.redirect(url, 308);
    }
    if (fate?.kind === "gone") return blogGoneResponse(pathLocale);

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
  matcher: [
    "/((?!_next|auth|dev/|favicon.ico|manifest.webmanifest).*)",
  ],
};

