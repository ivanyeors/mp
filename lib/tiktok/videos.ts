import type { TikTokVideo } from "@/lib/tiktok/types";
import type { Locale } from "@/lib/i18n/locales";
import { withLocale } from "@/lib/i18n/routing";
import { isAllowedImageUrl, isAllowedLinkUrl } from "@/lib/page-builder/validation";
import { parseTikTokUrl, tiktokPostUrl } from "@/lib/tiktok/embed";
import type { TikTokVideoItemContent } from "@/lib/types/landing-sections";

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

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
      buttonUrl: href.startsWith("/") ? withLocale(href, locale) : href,
      buttonLabel: text(item.buttonLabel) ?? fallbackButtonLabel,
    });
  }
  return out;
}
