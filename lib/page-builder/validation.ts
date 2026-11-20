import { z } from "zod/v4";
import type { SectionType, CustomSectionType } from "@/lib/types/landing-sections";
import { tiktokPostId } from "@/lib/tiktok/embed";
import { MAX_TIKTOK_VIDEOS, TIKTOK_HOOK_MAX_CHARS, isAllowedLinkUrl } from "@/lib/page-builder/link-rules";

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
  "explore",
] as const;

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
  "explore",
  "delivery_estimator",
] as const;

export function isCustomSectionType(type: string): type is CustomSectionType {
  return (CUSTOM_SECTION_TYPES as readonly string[]).includes(type);
}

export function isSingletonSectionType(type: string): boolean {
  return (SINGLETON_SECTION_TYPES as readonly string[]).includes(type);
}

export const SectionTypeSchema = z.enum(SECTION_TYPES);

export const CreatableSectionTypeSchema = z.enum(CUSTOM_SECTION_TYPES);

export const SlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Lowercase letters, numbers and dashes only");

export const ALLOWED_IMAGE_HOSTS = ["irgxjthamhiaolvdfgar.supabase.co"] as const;

export function isAllowedImageUrl(value: string): boolean {
  const url = value.trim();
  if (url === "") return true;
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

const IMAGE_KEYS = ["image"] as const;

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

export { isAllowedLinkUrl, MAX_TIKTOK_VIDEOS, TIKTOK_HOOK_MAX_CHARS };

function localisedStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.values(value).filter((v): v is string => typeof v === "string");
  }
  return [];
}

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

export function sectionContentErrors(sectionType: string, content: Record<string, unknown>): string[] {
  return sectionType === "tiktok_videos" ? tiktokVideosContentErrors(content) : [];
}
export type KnownSectionType = SectionType;
