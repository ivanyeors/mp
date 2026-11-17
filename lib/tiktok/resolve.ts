import { canonicalTikTokUrl, parseTikTokUrl, tiktokPostUrl } from "@/lib/tiktok/embed";

/**
 * Turn whatever Staff paste into a stored TikTok post link, at save time.
 *
 * Share links from the app (vm./vt.tiktok.com, /t/…) are redirects, so they are
 * followed here, once, on the server; the page never makes that hop. The post
 * is then checked against TikTok's oEmbed endpoint, which answers only for a
 * public, embeddable post — a private or deleted video is refused before it
 * reaches the page as a broken player.
 */

const TIMEOUT_MS = 8_000;
const MAX_HOPS = 4;
const USER_AGENT = "Mozilla/5.0 (compatible; link-check)";

export type ResolveResult =
  | {
      ok: true;
      id: string;
      /** Canonical link to store and to send "Watch on TikTok" to. */
      url: string;
      /** False when TikTok could not be asked; the link parsed but is unchecked. */
      verified: boolean;
    }
  | { ok: false; error: string };

const NOT_A_POST =
  "That isn't a link to a TikTok video. Open the video on TikTok, tap Share, then Copy link, and paste that.";

async function followShortLink(start: string, fetchImpl: typeof fetch): Promise<string | null> {
  let current = start;
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const res = await fetchImpl(current, {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return null;
    const next = new URL(location, current).toString();
    const parsed = parseTikTokUrl(next);
    if (parsed?.kind === "post") return tiktokPostUrl(parsed);
    if (parsed?.kind !== "short") return null; // e.g. redirected to the TikTok home page
    current = parsed.url;
  }
  return null;
}

/** True when TikTok's oEmbed answers for the post; null when TikTok could not be reached. */
async function isEmbeddable(url: string, fetchImpl: typeof fetch): Promise<boolean | null> {
  try {
    const res = await fetchImpl(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 500) return null;
    if (!res.ok) return false;
    const body = (await res.json().catch(() => null)) as { embed_product_id?: unknown } | null;
    return Boolean(body && typeof body.embed_product_id === "string");
  } catch {
    return null;
  }
}

export async function resolveTikTokLink(input: string, fetchImpl: typeof fetch = fetch): Promise<ResolveResult> {
  const parsed = parseTikTokUrl(input);
  if (!parsed) return { ok: false, error: NOT_A_POST };

  let url = canonicalTikTokUrl(input);
  if (parsed.kind === "short") {
    try {
      url = await followShortLink(parsed.url, fetchImpl);
    } catch {
      return {
        ok: false,
        error: "Couldn't open that share link. Paste the full link from tiktok.com instead (it has /video/ and a long number).",
      };
    }
    if (!url) return { ok: false, error: "That share link doesn't lead to a TikTok video." };
  }
  if (!url) return { ok: false, error: NOT_A_POST };

  const id = parseTikTokUrl(url);
  if (id?.kind !== "post") return { ok: false, error: NOT_A_POST };

  const embeddable = await isEmbeddable(url, fetchImpl);
  if (embeddable === false) {
    return {
      ok: false,
      error: "TikTok won't show this video on other sites. Check it is public and that embedding is allowed in its privacy settings.",
    };
  }
  return { ok: true, id: id.id, url, verified: embeddable === true };
}
