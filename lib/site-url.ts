import type { NextRequest } from "next/server";

const LOCAL_DEV_ORIGIN = "http://localhost:3000";
const PROD_FALLBACK_ORIGIN = "https://custom.mpillow.com";
const PUBLIC_DOMAIN = "mpillow.com";

function normalizeOrigin(url: string | undefined | null): string | null {
  const trimmed = url?.trim().replace(/\/$/, "");
  return trimmed || null;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function getSiteOrigin(): string {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;

  if (process.env.VERCEL_ENV !== "production") {
    const vercel = normalizeOrigin(
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null,
    );
    if (vercel) return vercel;
  }

  if (process.env.NODE_ENV === "production") return PROD_FALLBACK_ORIGIN;
  return LOCAL_DEV_ORIGIN;
}

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

export function getClientPublicOrigin(): string {
  if (
    typeof window !== "undefined" &&
    (isLocalHost(window.location.hostname) ||
      process.env.NODE_ENV === "development")
  ) {
    return window.location.origin;
  }
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL);
  if (configured) return configured;
  if (
    typeof window !== "undefined" &&
    !isVercelDeploymentHost(window.location.hostname)
  ) {
    return window.location.origin;
  }
  return getSiteOrigin();
}

function isVercelDeploymentHost(hostname: string): boolean {
  return /\.vercel\.app$/i.test(hostname);
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === PUBLIC_DOMAIN || host.endsWith(`.${PUBLIC_DOMAIN}`);
}

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
  if (forwardedHost && isPublicHost(forwardedHost.split(":")[0] ?? "")) {
    const proto = firstHeaderValue(request.headers.get("x-forwarded-proto")) ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  if (isPublicHost(requestUrl.hostname)) return requestUrl.origin;

  return PROD_FALLBACK_ORIGIN;
}

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
