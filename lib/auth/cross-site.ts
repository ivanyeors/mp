/**
 * Cross-site write guard for the API (proxy.ts).
 *
 * Route handlers authenticate by session cookie, which SameSite=Lax keeps off
 * cross-site form posts, but not off a fetch from a sibling `*.mpillow.com`
 * origin (the same "site"): a script there could POST as a signed-in Staff
 * member or customer. A browser always sends `Origin` on such a request, so a
 * write whose Origin is another host is refused. Servers calling our webhooks
 * and crons send no Origin, and those routes verify their own signature or
 * secret, so they are left alone.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Signed or secret-gated server-to-server endpoints, never called from a page. */
const SERVER_TO_SERVER_PREFIXES = [
  "/api/stripe/webhook",
  "/api/shopify/webhook",
  "/api/telegram/webhook",
  "/api/shipping/easyship/webhook",
  "/api/email/resend-webhook",
  "/api/email/unsubscribe",
  "/api/webhooks/",
  "/api/cron/",
];

export function isCrossSiteWrite(req: Request, pathname: string): boolean {
  if (SAFE_METHODS.has(req.method.toUpperCase())) return false;
  if (SERVER_TO_SERVER_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return false;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const host = req.headers.get("host");
  try {
    return new URL(origin).host !== host;
  } catch {
    // "null" (sandboxed frames, privacy redirects) is not this site.
    return true;
  }
}
