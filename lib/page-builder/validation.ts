import { z } from "zod/v4";
import type { SectionType, CustomSectionType } from "@/lib/types/landing-sections";
import { tiktokPostId } from "@/lib/tiktok/embed";

/**
 * Write-path validation for Landing sections (see CONTEXT.md — **Landing section**).
 *
 * The API used to accept `section_type: z.string()` and `content: z.record(unknown)`,
 * so a typo'd type or a bad image URL saved cleanly and only failed at render — on a
 * page with no error boundary. Everything a caller may write now goes through here.
 */

/** Seeded by migration 0027. Their components branch on `slug`, so both are fixed. */
export const BUILT_IN_SECTION_TYPES = [
  "hero",
  "text_image",
  "marquee",
  "stories",
  "pick_your_mpillow",
  "neck_pains",
  "why_choose_highlights",
  "product_card",
  "credibility",
  "video_embed",
  "founder_note",
] as const;

/** Addable and removable from the builder. */
export const CUSTOM_SECTION_TYPES = [
  "custom_text_image",
  "custom_full_width_image",
  "custom_video",
  "custom_rich_text",
  "featured_products",
  "shop_cta",
  "faq",
  "delivery_estimator",
  "tiktok_videos",
] as const;

export const SECTION_TYPES = [...BUILT_IN_SECTION_TYPES, ...CUSTOM_SECTION_TYPES] as const;

/**
 * Types that must exist at most once on the page. `faq` renders FAQPage JSON-LD, so a
 * second one emits a duplicate block; the rest are singletons because the seed and the
 * i18n namespace assume one. `text_image` is deliberately absent — the seed ships two
 * (`size-matters`, `ambassadors`).
 */
export const SINGLETON_SECTION_TYPES = [
  "hero",
  "faq",
  "stories",
  "marquee",
  "pick_your_mpillow",
  "neck_pains",
  "why_choose_highlights",
  "credibility",
  "founder_note",
  // One per page: its form fields carry fixed ids.
  "delivery_estimator",
] as const;

export function isCustomSectionType(type: string): type is CustomSectionType {
  return (CUSTOM_SECTION_TYPES as readonly string[]).includes(type);
}

export function isSingletonSectionType(type: string): boolean {
  return (SINGLETON_SECTION_TYPES as readonly string[]).includes(type);
}

export const SectionTypeSchema = z.enum(SECTION_TYPES);

/** Only custom types may be created; built-ins are seeded, never POSTed. */
export const CreatableSectionTypeSchema = z.enum(CUSTOM_SECTION_TYPES);

export const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only");

/**
 * Hosts `next/image` is configured to optimise, mirrored from `next.config.ts`.
 * A URL outside this list throws during server render, which on the landing page
 * (no error boundary) means a 500 for every visitor — so it is rejected at write time.
 */
export const ALLOWED_IMAGE_HOSTS = ["irgxjthamhiaolvdfgar.supabase.co"] as const;

export function isAllowedImageUrl(value: string): boolean {
  const url = value.trim();
  if (url === "") return true; // cleared field — falls back to the site_settings slot
  // Repo-relative assets under /public.
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  return (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(parsed.hostname);
}

/** Content keys that carry an image URL and must therefore be host-checked. */
const IMAGE_KEYS = ["image"] as const;

/**
 * A Landing section's `content`. Values stay loosely typed — each section type reads
 * its own shape, and slice 03 adds locale maps — but image URLs are checked, because
 * they are the one field that can take the homepage down.
 */
export const SectionContentSchema = z
  .record(z.string(), z.unknown())
  .superRefine((content, ctx) => {
    for (const key of IMAGE_KEYS) {
      const value = content[key];
      if (value == null) continue;
      if (typeof value !== "string") {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be a string URL`,
        });
        continue;
      }
      if (!isAllowedImageUrl(value)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            `Image must be a repo-relative path or an https URL on ` +
            `${ALLOWED_IMAGE_HOSTS.join(", ")}. Pick it from the media library instead of pasting a link.`,
        });
      }
    }
  });

export type ValidatedSectionContent = z.infer<typeof SectionContentSchema>;

/** A button link: a path on this site, or an https URL. */
export function isAllowedLinkUrl(value: string): boolean {
  const url = value.trim();
  if (url.startsWith("/")) return !url.startsWith("//") && !url.startsWith("/\\");
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

/** More than this and the band is a wall, not a pick; the cards are meant to be curated. */
export const MAX_TIKTOK_VIDEOS = 20;
/** Hard ceiling on a card's hook. The card shows three lines (about 50 characters). */
export const TIKTOK_HOOK_MAX_CHARS = 120;

/** Every string in a value that may be a bare string or a locale map. */
function localisedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).filter((v): v is string => typeof v === "string");
  }
  return [];
}

/**
 * A TikTok videos section's content. Each video needs its post link, a cover and
 * a button link — the video is shown for display and the button is where it leads,
 * so a video without one is refused rather than shown as a dead end.
 */
export function tiktokVideosContentErrors(content: Record<string, unknown>): string[] {
  const errors: string[] = [];
  const { direction, videos } = content;

  if (direction !== undefined && direction !== "left" && direction !== "right") {
    errors.push('Direction must be "left" or "right".');
  }
  if (videos === undefined) return errors;
  if (!Array.isArray(videos)) return [...errors, "Videos must be a list."];
  if (videos.length > MAX_TIKTOK_VIDEOS) {
    errors.push(`Keep it to ${MAX_TIKTOK_VIDEOS} videos or fewer.`);
  }

  videos.forEach((raw, i) => {
    const n = `Video ${i + 1}`;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      errors.push(`${n} is not a video.`);
      return;
    }
    const video = raw as Record<string, unknown>;

    if (typeof video.tiktokUrl !== "string" || !tiktokPostId(video.tiktokUrl)) {
      errors.push(`${n}: paste the link to the video on TikTok.`);
    }
    if (typeof video.image !== "string" || video.image.trim() === "") {
      errors.push(`${n}: pick a cover image.`);
    } else if (!isAllowedImageUrl(video.image)) {
      errors.push(`${n}: pick the cover from the media library instead of pasting a link.`);
    }
    if (typeof video.buttonUrl !== "string" || video.buttonUrl.trim() === "") {
      errors.push(`${n}: add the button link (a page such as /shop, or an https:// address).`);
    } else if (!isAllowedLinkUrl(video.buttonUrl)) {
      errors.push(`${n}: the button link must start with / or https://.`);
    }
    if (localisedStrings(video.hook).some((hook) => hook.length > TIKTOK_HOOK_MAX_CHARS)) {
      errors.push(`${n}: keep the hook under ${TIKTOK_HOOK_MAX_CHARS} characters.`);
    }
  });

  return errors;
}

/** Content rules for one section type, beyond the image-host check every type gets. */
export function sectionContentErrors(sectionType: string, content: Record<string, unknown>): string[] {
  return sectionType === "tiktok_videos" ? tiktokVideosContentErrors(content) : [];
}
export type KnownSectionType = SectionType;
