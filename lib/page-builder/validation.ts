import { z } from "zod/v4";
import type { SectionType, CustomSectionType } from "@/lib/types/landing-sections";

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
export type KnownSectionType = SectionType;
