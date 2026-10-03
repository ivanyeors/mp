import { DEFAULT_LOCALE } from "@/lib/i18n/locales";
import { getPublicOrigin } from "@/lib/site-url";

/**
 * Shared by the TikTok connect and callback routes: the OAuth redirect URI
 * (must match the one registered in the TikTok app exactly), the state cookie,
 * and where the admin lands afterwards.
 */

export const TIKTOK_STATE_COOKIE = "tiktok_oauth_state";
export const TIKTOK_COOKIE_PATH = "/api/social-inbox/tiktok";

export function tiktokRedirectUri(req: Request): string {
  return `${getPublicOrigin(req)}/api/social-inbox/tiktok/callback`;
}

export function tiktokWebhookUrl(req: Request): string {
  return `${getPublicOrigin(req)}/api/webhooks/tiktok-messages`;
}

/** Back to Staff Management → Telegram access, with an outcome the tab toasts. */
export function settingsReturnUrl(req: Request, params: Record<string, string>): URL {
  const url = new URL(`/${DEFAULT_LOCALE}/settings/staff-management`, req.url);
  url.searchParams.set("tab", "telegram");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v.slice(0, 300));
  return url;
}
