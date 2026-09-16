import type { NextRequest } from "next/server";

const LOCAL_DEV_ORIGIN = "http://localhost:3000";
const PROD_FALLBACK_ORIGIN = "https://custom.mpillow.com";

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

/**
 * True for a Vercel-minted deployment hostname (`*.vercel.app`).
 *
 * These are the URLs Deployment Protection gates: hitting one without a Vercel
 * session lands on `vercel.com/login?next=/sso-api...`, not on our page. A
 * customer has no Vercel account, so any customer-facing link built from one is
 * a dead end.
 */
function isVercelDeploymentHost(hostname: string): boolean {
  return /\.vercel\.app$/i.test(hostname);
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

/**
 * Canonical origin for links we hand to someone outside the app — email CTAs,
 * Stripe success/cancel URLs, Telegram deep links.
 *
 * Distinct from `getRequestOrigin`, which answers "where did this browser come
 * from" for an auth round-trip. This one answers "where can a stranger reach
 * us", and its contract is stronger: in production it never returns a
 * `*.vercel.app` deployment host.
 *
 * That matters most for cron. Vercel invokes a scheduled function at the
 * deployment URL, never at the custom domain, so a route that derived its
 * origin from `new URL(req.url).origin` emailed every customer a protected
 * link — the payment-due reminder was landing on the Vercel SSO login wall.
 *
 * Preview deployments keep their own origin on purpose: a preview must not mint
 * production links, and whoever is testing a preview is already signed in to
 * Vercel.
 */
export function getPublicOrigin(request: NextRequest | Request): string {
  const requestUrl = new URL(request.url);
  if (
    isLocalHost(requestUrl.hostname) ||
    process.env.NODE_ENV === "development"
  ) {
    return requestUrl.origin;
  }

  if (process.env.VERCEL_ENV === "preview") return requestUrl.origin;

  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"));
  if (forwardedHost && !isVercelDeploymentHost(forwardedHost.split(":")[0] ?? "")) {
    const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  if (!isVercelDeploymentHost(requestUrl.hostname)) return requestUrl.origin;

  // Nothing trustworthy left: a deployment host is the one answer that is
  // certainly wrong, so fall through to the known public domain.
  return PROD_FALLBACK_ORIGIN;
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
