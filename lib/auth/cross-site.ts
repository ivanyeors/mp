const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

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
    return true;
  }
}
