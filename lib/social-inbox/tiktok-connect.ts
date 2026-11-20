import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getPublicOrigin } from "@/lib/site-url";

export const TIKTOK_STATE_COOKIE = "tiktok_oauth_state";
export const TIKTOK_COOKIE_PATH = "/api/social-inbox/tiktok";

export function tiktokRedirectUri(req: Request): string {
  return `${getPublicOrigin(req)}/api/social-inbox/tiktok/callback/`;
}

export function tiktokWebhookUrl(req: Request): string {
  return `${getPublicOrigin(req)}/api/webhooks/tiktok-messages`;
}

export function settingsReturnUrl(req: Request, params: Record<string, string>): URL {
  const url = new URL(`/${DEFAULT_LOCALE}/settings/users`, req.url);
  url.searchParams.set("tab", "telegram");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v.slice(0, 300));
  return url;
}
