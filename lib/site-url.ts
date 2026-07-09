import type { NextRequest } from "next/server";

const LOCAL_DEV_ORIGIN = "http://localhost:3000";
const PROD_FALLBACK_ORIGIN = "https://work.mpillow.com";

function normalizeOrigin(url: string | undefined | null): string | null {
  const trimmed = url?.trim().replace(/\/$/, "");
  return trimmed || null;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/**
 * Canonical public origin for server code and auth redirects.
 * Prefer NEXT_PUBLIC_SITE_URL; on Vercel fall back to VERCEL_URL.
 */
export function getSiteOrigin(): string {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const vercel = normalizeOrigin(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
  );
  if (vercel) return vercel;

  if (process.env.NODE_ENV === "production") return PROD_FALLBACK_ORIGIN;
  return LOCAL_DEV_ORIGIN;
}

/** Browser auth redirects — live tab wins in local dev over configured origin. */
export function getClientSiteOrigin(): string {
  if (
    typeof window !== "undefined" &&
    (isLocalHost(window.location.hostname) ||
      process.env.NODE_ENV === "development")
  ) {
    return window.location.origin;
  }
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return getSiteOrigin();
}

/** Proxy-aware origin for auth route handlers on Vercel. */
export function getRequestOrigin(request: NextRequest | Request): string {
  const requestUrl = new URL(request.url);
  if (
    isLocalHost(requestUrl.hostname) ||
    process.env.NODE_ENV === "development"
  ) {
    return requestUrl.origin;
  }

  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost.split(",")[0]?.trim()}`;
  }

  return requestUrl.origin;
}

export function authCallbackUrl(nextPath: string): string {
  const origin =
    typeof window !== "undefined" ? getClientSiteOrigin() : getSiteOrigin();
  return `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`;
}
