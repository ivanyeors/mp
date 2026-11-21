import { z } from "zod/v4";

import { checkBannedClinical, checkBannedClinicalZh } from "@/lib/i18n/copy-bands";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { ALLOWED_IMAGE_HOSTS, isAllowedImageUrl } from "@/lib/page-builder/validation";

import { getMessages } from "@/lib/i18n/messages";

import { VIDEO_ID_PATTERN, type SlideInSectionContent } from "./content";
import { copyFieldsFor } from "./fields";
import { slideMessages, type SlideInPageKey } from "./pages";

const MAX_TEXT = 2000;

const ImageOverrideSchema = z
  .object({
    src: z.string().max(2048),
    alt: z.string().max(300).optional(),
    assetId: z.string().max(64).nullable().optional(),
  })
  .superRefine((image, ctx) => {
    if (!isAllowedImageUrl(image.src)) {
      ctx.addIssue({
        code: "custom",
        path: ["src"],
        message:
          `Image must be a repo-relative path or an https URL on ${ALLOWED_IMAGE_HOSTS.join(", ")}. ` +
          `Pick it from the media library instead of pasting a link.`,
      });
    }
  });

const MediaValueSchema = z.union([
  ImageOverrideSchema,
  z.array(ImageOverrideSchema.nullable()).max(20),
  z
    .string()
    .max(40)
    .refine((id) => id.trim() === "" || VIDEO_ID_PATTERN.test(id.trim()), {
      message: "Video must be a YouTube video id, e.g. r9XfezALQhA — not a link.",
    }),
]);

const LocaleCopySchema = z.record(z.string(), z.unknown());

export const SlideInContentSchema = z
  .object({
    copy: z.partialRecord(z.enum(SUPPORTED_LOCALES), LocaleCopySchema).optional(),
    media: z.record(z.string(), MediaValueSchema).optional(),
  })
  .strict()
  .superRefine((content, ctx) => {
    for (const [locale, copy] of Object.entries(content.copy ?? {})) {
      for (const [path, text] of strings(copy)) {
        if (text.length > MAX_TEXT) {
          ctx.addIssue({
            code: "custom",
            path: ["copy", locale, ...path],
            message: `Keep each field under ${MAX_TEXT} characters.`,
          });
        }
      }
    }
  });

export function strings(value: unknown, path: Array<string | number> = []): Array<[Array<string | number>, string]> {
  if (typeof value === "string") return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, [...path, i]));
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, item]) =>
      strings(item, [...path, key]),
    );
  }
  return [];
}

export interface SlideInCopyIssue {
  field: string;
  locale: Locale;
  message: string;
}

export function validateSlideInCopy(
  sectionType: string,
  content: SlideInSectionContent,
  knownCopy?: Partial<Record<Locale, ReadonlySet<string>>>,
): SlideInCopyIssue[] {
  const issues: SlideInCopyIssue[] = [];
  const fields = copyFieldsFor(sectionType);
  for (const locale of SUPPORTED_LOCALES) {
    const copy = content.copy?.[locale];
    if (!copy) continue;
    for (const field of fields) {
      for (const [, text] of strings(copy[field.key])) {
        if (knownCopy?.[locale]?.has(text)) continue;
        const message =
          locale === "zh-CN"
            ? checkBannedClinicalZh(field.label, text)
            : checkBannedClinical(field.label, text);
        if (message) issues.push({ field: field.key, locale, message });
      }
    }
  }
  return issues;
}

export function formatSlideInCopyIssues(issues: SlideInCopyIssue[]): string {
  return issues.map((i) => `${i.message} (${i.locale})`).join(" ");
}

export function knownSlideCopy(page: SlideInPageKey): Record<Locale, ReadonlySet<string>> {
  const out = {} as Record<Locale, ReadonlySet<string>>;
  for (const locale of SUPPORTED_LOCALES) {
    out[locale] = new Set(strings(slideMessages(getMessages(locale), page)).map(([, s]) => s));
  }
  return out;
}
