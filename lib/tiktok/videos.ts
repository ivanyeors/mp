import type { TikTokVideo } from "@/lib/tiktok/types";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { isAllowedImageUrl, isAllowedLinkUrl } from "@/lib/page-builder/validation";
import { parseTikTokUrl, tiktokPostUrl } from "@/lib/tiktok/embed";
import type { TikTokVideoItemContent } from "@/lib/types/landing-sections";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/**
 * Stored videos (already projected onto one locale) → what the band shows.
 *
 * A video missing its post, cover or button link is left out rather than shown
 * broken. The editor refuses to save one, so this only guards rows written
 * some other way.
 */
export function tiktokVideosFromContent(
  items: unknown,
  locale: Locale,
  fallbackButtonLabel: string,
): TikTokVideo[] {
  if (!Array.isArray(items)) return [];
  const out: TikTokVideo[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as TikTokVideoItemContent;
    const post = typeof item.tiktokUrl === "string" ? parseTikTokUrl(item.tiktokUrl) : null;
    const cover = text(item.image);
    const href = text(item.buttonUrl);
    if (post?.kind !== "post" || !cover || !isAllowedImageUrl(cover) || !href || !isAllowedLinkUrl(href)) continue;

    out.push({
      id: post.id,
      url: tiktokPostUrl(post),
      cover,
      alt: text(item.alt),
      hook: text(item.hook),
      // Paths on this site get the visitor's language, like every other internal link.
      buttonUrl: href.startsWith("/") ? withLocale(href, locale) : href,
      buttonLabel: text(item.buttonLabel) ?? fallbackButtonLabel,
    });
  }
  return out;
}
