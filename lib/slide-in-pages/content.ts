import type { Locale } from "@/lib/i18n/locales";
import type { ProductSlideSectionConfig } from "@/lib/product-slide-sections/section-config";
import {
  resolveMeasurementHeader,
  resolveMeasurementSteps,
  resolveReviewTitle,
  resolveSlideContent,
  resolveTestimonialHeader,
} from "@/lib/product-slide-sections/resolve-slide-content";
import type { ImageMediaConfig } from "@/lib/product-slide-sections/types";

import { copyFieldsFor, mediaFieldsFor, type CopyField, type SubField } from "./fields";

export interface SlideInSectionContent {
  copy?: Partial<Record<Locale, Record<string, unknown>>>;
  media?: Record<string, unknown>;
}

export interface MediaOverride {
  src: string;
  alt?: string;
  assetId?: string | null;
}

export const HEADER_SLUG = "header";

export const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{6,20}$/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function resolveSectionDefaults(
  messages: Record<string, unknown>,
  section: ProductSlideSectionConfig,
): Record<string, unknown> {
  switch (section.type) {
    case "testimonial_card": {
      const header = resolveTestimonialHeader(messages);
      return {
        ...resolveSlideContent(messages, "testimonial_card", section.contentKey),
        headerTitle: header.title,
        headerIntro: header.intro,
        reviewTitle: resolveReviewTitle(messages),
      };
    }
    case "measurement_grid": {
      const header = resolveMeasurementHeader(messages);
      return { title: header.title, intro: header.intro, steps: resolveMeasurementSteps(messages) };
    }
    case "purchase_panel":
      return {
        heroLabel: messages.heroLabel,
        heroTitle: messages.heroTitle,
        heroDescription: messages.heroDescription,
        purchaseNote: messages.purchaseNote,
      };
    case "full_bleed_media":
      return section.contentKey
        ? { ...resolveSlideContent(messages, "full_bleed_media", section.contentKey) }
        : {};
    default:
      return { ...resolveSlideContent(messages, section.type, section.contentKey) };
  }
}

export function headerDefaults(messages: Record<string, unknown>): Record<string, unknown> {
  return { title: messages.title, description: messages.description };
}

function mergeRecord(
  fallback: Record<string, unknown>,
  override: unknown,
  fields: SubField[],
): Record<string, unknown> {
  const out = { ...fallback };
  const source = asRecord(override);
  for (const { key } of fields) {
    const value = nonEmptyString(source[key]);
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function recordHasText(record: Record<string, unknown>, fields: SubField[]): boolean {
  return fields.some(({ key }) => nonEmptyString(record[key]) !== undefined);
}

function applyField(field: CopyField, fallback: unknown, override: unknown): unknown {
  switch (field.kind) {
    case "text":
      return nonEmptyString(override) ?? fallback;

    case "list": {
      if (!Array.isArray(override)) return fallback;
      const items = override.filter((item): item is string => nonEmptyString(item) !== undefined);
      return items.length > 0 ? items : fallback;
    }

    case "cards": {
      if (!Array.isArray(override)) return fallback;
      const defaults = Array.isArray(fallback) ? (fallback as unknown[]) : [];
      const count = field.fixedCount ? defaults.length : override.length;
      const cards: Record<string, unknown>[] = [];
      for (let i = 0; i < count; i += 1) {
        const merged = mergeRecord(asRecord(defaults[i]), override[i], field.fields);
        if (recordHasText(merged, field.fields)) cards.push(merged);
      }
      return cards.length > 0 ? cards : fallback;
    }

    case "group": {
      if (override == null) return fallback;
      return mergeRecord(asRecord(fallback), override, field.fields);
    }
  }
}

export function applyCopyOverride(
  sectionType: string,
  defaults: Record<string, unknown>,
  override: unknown,
): Record<string, unknown> {
  const source = asRecord(override);
  const out = { ...defaults };
  for (const field of copyFieldsFor(sectionType)) {
    if (!(field.key in source)) continue;
    const value = applyField(field, defaults[field.key], source[field.key]);
    if (value !== undefined) out[field.key] = value;
  }
  return out;
}

export function copyOverrideFor(
  content: SlideInSectionContent | null | undefined,
  locale: Locale,
): Record<string, unknown> {
  return asRecord(content?.copy?.[locale]);
}

function mergeImage(fallback: ImageMediaConfig | undefined, override: unknown): ImageMediaConfig | undefined {
  const source = asRecord(override);
  const src = nonEmptyString(source.src);
  if (!src) return fallback;
  return {
    ...(fallback ?? { alt: "" }),
    src,
    alt: nonEmptyString(source.alt) ?? fallback?.alt ?? "",
    assetId: typeof source.assetId === "string" ? source.assetId : undefined,
  };
}

export function applyMediaOverride<T extends ProductSlideSectionConfig>(section: T, media: unknown): T {
  const source = asRecord(media);
  if (Object.keys(source).length === 0) return section;

  const next = { ...section } as Record<string, unknown>;
  for (const field of mediaFieldsFor(section)) {
    if (!(field.key in source)) continue;
    const value = source[field.key];
    if (field.kind === "image") {
      next[field.key] = mergeImage(field.fallback, value);
    } else if (field.kind === "images") {
      const overrides = Array.isArray(value) ? value : [];
      next[field.key] = field.fallbacks.map((fallback, i) => mergeImage(fallback, overrides[i]));
    } else if (field.kind === "video") {
      const id = nonEmptyString(value)?.trim();
      if (id && VIDEO_ID_PATTERN.test(id)) next.videoId = id;
    }
  }
  return next as T;
}

export function mediaReferences(content: SlideInSectionContent | null | undefined): {
  urls: string[];
  assetIds: string[];
} {
  const urls: string[] = [];
  const assetIds: string[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = asRecord(value);
    const src = nonEmptyString(record.src);
    if (src) urls.push(src);
    if (typeof record.assetId === "string" && record.assetId) assetIds.push(record.assetId);
  };
  Object.values(asRecord(content?.media)).forEach(visit);
  return { urls, assetIds };
}
