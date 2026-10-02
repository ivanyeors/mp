import { SUPPORTED_LOCALES } from "@/lib/i18n/locales";
import { getSiteOrigin } from "@/lib/site-url";
import { localeUrl } from "@/lib/seo/locale-url";

/**
 * IndexNow (PRD-search-visibility slice 15): tell Bing — which grounds Copilot
 * and ChatGPT search — and other IndexNow engines that a URL changed, instead
 * of waiting for a recrawl. Google does not use IndexNow; it reads the sitemap.
 *
 * Ownership is proven by the key file at /indexnow-key.txt (root, so it covers
 * every URL on the host). Production only, so preview deploys never ping.
 */

export const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
export const INDEXNOW_KEY_PATH = "/indexnow-key.txt";

/** IndexNow keys: 8–128 chars of a-z, A-Z, 0-9 and '-'. */
export function getIndexNowKey(): string | null {
  const key = process.env.INDEXNOW_KEY?.trim();
  return key && /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : null;
}

export function blogPostUrls(slug: string): string[] {
  return SUPPORTED_LOCALES.map((lang) => localeUrl(lang, `/blog/${encodeURIComponent(slug)}`));
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type IndexNowResult = { ok: true; status: number } | { ok: false; reason: string };

/** Never throws: a ping is a hint, and a failure must not fail the save that triggered it. */
export async function pingIndexNow(
  urls: string[],
  opts: { fetchImpl?: FetchLike; env?: string | undefined } = {},
): Promise<IndexNowResult> {
  const key = getIndexNowKey();
  if (!key) return { ok: false, reason: "INDEXNOW_KEY not set" };
  if ((opts.env ?? process.env.VERCEL_ENV) !== "production") return { ok: false, reason: "not production" };
  const origin = getSiteOrigin();
  const host = new URL(origin).host;
  const urlList = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  if (!urlList.length) return { ok: false, reason: "no URLs on this host" };

  try {
    const res = await (opts.fetchImpl ?? fetch)(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${origin}${INDEXNOW_KEY_PATH}`, urlList }),
    });
    // 200 = accepted, 202 = accepted pending key validation.
    if (res.ok) return { ok: true, status: res.status };
    console.warn(`[indexnow] ${res.status} for ${urlList.length} URL(s)`);
    return { ok: false, reason: `HTTP ${res.status}` };
  } catch (e) {
    console.warn("[indexnow] ping failed:", e instanceof Error ? e.message : e);
    return { ok: false, reason: "network" };
  }
}
