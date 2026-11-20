import { z } from "zod";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { PRODUCT_SOURCE_LOCALE, productLocale } from "./product-locales";

export const PRODUCT_AI_LIMITS = {
  brief: 500,
  keyphrase: 80,
  field: 4_000,
  body: 20_000,
} as const;

const ContentSchema = z.object({
  title: z.string().max(PRODUCT_AI_LIMITS.field).default(""),
  description: z.string().max(PRODUCT_AI_LIMITS.field).default(""),
  body: z.string().max(PRODUCT_AI_LIMITS.body).default(""),
  seo_title: z.string().max(PRODUCT_AI_LIMITS.field).default(""),
  seo_description: z.string().max(PRODUCT_AI_LIMITS.field).default(""),
  seo_answer: z.string().max(PRODUCT_AI_LIMITS.field).default(""),
});
export type ProductAiContent = z.infer<typeof ContentSchema>;

const LocaleSchema = z.enum(SUPPORTED_LOCALES);

export const DESCRIPTION_MODES = ["new", "improve", "translate"] as const;
export type DescriptionMode = (typeof DESCRIPTION_MODES)[number];

export const DESCRIPTION_MODE_LABEL: Record<DescriptionMode, string> = {
  new: "Write it fresh",
  improve: "Improve what's there",
  translate: "Translate from English",
};

export const DESCRIPTION_PARTS = ["both", "body", "description"] as const;
export type DescriptionParts = (typeof DESCRIPTION_PARTS)[number];

export const DESCRIPTION_PARTS_LABEL: Record<DescriptionParts, string> = {
  both: "Short description and body",
  body: "Body only",
  description: "Short description only",
};

export const DESCRIPTION_LENGTHS = ["short", "medium", "long"] as const;
export type DescriptionLength = (typeof DESCRIPTION_LENGTHS)[number];

export const DESCRIPTION_LENGTH_LABEL: Record<DescriptionLength, string> = { short: "Short", medium: "Medium", long: "Long" };

export const BODY_LENGTH: Record<DescriptionLength, Record<"words" | "characters", { min: number; max: number }>> = {
  short: { words: { min: 80, max: 150 }, characters: { min: 140, max: 270 } },
  medium: { words: { min: 150, max: 260 }, characters: { min: 270, max: 470 } },
  long: { words: { min: 260, max: 420 }, characters: { min: 470, max: 750 } },
};

export const ProductAiRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("description"),
    locale: LocaleSchema,
    mode: z.enum(DESCRIPTION_MODES),
    parts: z.enum(DESCRIPTION_PARTS),
    length: z.enum(DESCRIPTION_LENGTHS),
    brief: z.string().trim().max(PRODUCT_AI_LIMITS.brief, `Keep it under ${PRODUCT_AI_LIMITS.brief} characters.`).default(""),
    content: z.partialRecord(LocaleSchema, ContentSchema),
  }),
  z.object({
    kind: z.literal("seo"),
    locale: LocaleSchema,
    keyphrase: z.string().trim().max(PRODUCT_AI_LIMITS.keyphrase, `Keep the phrase under ${PRODUCT_AI_LIMITS.keyphrase} characters.`).default(""),
    content: z.partialRecord(LocaleSchema, ContentSchema),
  }),
]);
export type ProductAiRequest = z.infer<typeof ProductAiRequestSchema>;
export type DescriptionRequest = Extract<ProductAiRequest, { kind: "description" }>;
export type SeoRequest = Extract<ProductAiRequest, { kind: "seo" }>;

export const PRODUCT_AI_WORKING: Record<ProductAiRequest["kind"] | "translate", string> = {
  description: "Writing…",
  translate: "Translating…",
  seo: "Writing SEO…",
};

const has = (s: string | undefined) => Boolean(s?.trim());

export function contentIn(request: Pick<ProductAiRequest, "content">, locale: Locale): ProductAiContent {
  return request.content[locale] ?? ContentSchema.parse({});
}

export function descriptionModeBlocker(
  mode: DescriptionMode,
  locale: Locale,
  content: Partial<Record<Locale, Partial<ProductAiContent>>>,
  parts: DescriptionParts = "both",
): string | null {
  const here = content[locale];
  const source = content[PRODUCT_SOURCE_LOCALE];
  const english = productLocale(PRODUCT_SOURCE_LOCALE).label;
  if (mode === "improve") {
    const words = parts === "body" ? has(here?.body) : parts === "description" ? has(here?.description) : has(here?.body) || has(here?.description);
    return words ? null : "There's nothing written here to improve yet.";
  }
  if (mode === "translate") {
    if (locale === PRODUCT_SOURCE_LOCALE) return `This is the ${english} tab: there's nothing to translate from.`;
    const words = parts === "body" ? has(source?.body) : parts === "description" ? has(source?.description) : has(source?.body) || has(source?.description);
    return words ? null : `Write the ${english} first: there's nothing to translate yet.`;
  }
  return null;
}

export function productAiBlocker(request: ProductAiRequest): string | null {
  const title = contentIn(request, request.locale).title.trim() || contentIn(request, PRODUCT_SOURCE_LOCALE).title.trim();
  if (!title) return "Give the product a title first.";
  if (request.kind === "description") return descriptionModeBlocker(request.mode, request.locale, request.content, request.parts);
  return null;
}

export function descriptionAnswerSchema(parts: DescriptionParts) {
  return z.object({
    ...(parts !== "body" ? { description: z.string() } : {}),
    ...(parts !== "description" ? { body: z.string() } : {}),
    notes: z.string(),
  });
}

export const SeoAnswerSchema = z.object({
  seoTitle: z.string(),
  seoDescription: z.string(),
  seoAnswer: z.string(),
  notes: z.string(),
});

export type ProductAiResult =
  | {
      kind: "description";
      locale: Locale;
      description: string | null;
      body: string | null;
      notes: string;
    }
  | { kind: "seo"; locale: Locale; seoTitle: string; seoDescription: string; seoAnswer: string; notes: string };
