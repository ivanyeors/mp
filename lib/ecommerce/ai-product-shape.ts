/**
 * ✨ AI writing in the product editor: what the editor asks for, what Claude
 * fills in, and what comes back. Two asks, each for one language tab:
 *
 * - **Write** (`description`): the short description shown on shop listings
 *   and the body shown in the product page's Description tab (Markdown),
 *   written fresh from the product's details, improved from what is already
 *   written, or translated from the English.
 * - **Generate SEO** (`seo`): the SEO title, the meta description and the
 *   answer lede, for search results and AI answers.
 *
 * Pure, and safe in the browser. The editor sends what is on screen, saved or
 * not, since that is what Staff are working on; the route reads the product's
 * own facts (its type, category, options, variants and tags) itself. Nothing
 * here or on the server saves: what comes back is offered in the editor, and
 * only Staff choose it and press Save.
 */
import { z } from "zod";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { PRODUCT_SOURCE_LOCALE, productLocale } from "./product-locales";

export const PRODUCT_AI_LIMITS = {
  /** *Anything to add?*: a few sentences of Staff's own. */
  brief: 500,
  /** The search phrase Generate SEO aims at. */
  keyphrase: 80,
  /** A title or SEO field sent as it is in the editor. */
  field: 4_000,
  /** A body sent as it is in the editor. */
  body: 20_000,
} as const;

/** One language's words, as the editor has them now. */
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

/** Where Write starts from. */
export const DESCRIPTION_MODES = ["new", "improve", "translate"] as const;
export type DescriptionMode = (typeof DESCRIPTION_MODES)[number];

export const DESCRIPTION_MODE_LABEL: Record<DescriptionMode, string> = {
  new: "Write it fresh",
  improve: "Improve what's there",
  translate: "Translate from English",
};

/** What Write fills in. */
export const DESCRIPTION_PARTS = ["both", "body", "description"] as const;
export type DescriptionParts = (typeof DESCRIPTION_PARTS)[number];

export const DESCRIPTION_PARTS_LABEL: Record<DescriptionParts, string> = {
  both: "Short description and body",
  body: "Body only",
  description: "Short description only",
};

/** How long the body runs. */
export const DESCRIPTION_LENGTHS = ["short", "medium", "long"] as const;
export type DescriptionLength = (typeof DESCRIPTION_LENGTHS)[number];

export const DESCRIPTION_LENGTH_LABEL: Record<DescriptionLength, string> = { short: "Short", medium: "Medium", long: "Long" };

/** The body's length for each choice, in its language's unit (words in English, characters in Chinese). */
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

/** What the editor shows on the ✨ button while Claude writes. */
export const PRODUCT_AI_WORKING: Record<ProductAiRequest["kind"] | "translate", string> = {
  description: "Writing…",
  translate: "Translating…",
  seo: "Writing SEO…",
};

const has = (s: string | undefined) => Boolean(s?.trim());

/** Pure — the language's words, or empty ones. */
export function contentIn(request: Pick<ProductAiRequest, "content">, locale: Locale): ProductAiContent {
  return request.content[locale] ?? ContentSchema.parse({});
}

/** Pure — whether `mode` can run for this language and what is written (`null`), or why not. */
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

/** Pure — why this ask can't run (it has nothing to work from), or null. */
export function productAiBlocker(request: ProductAiRequest): string | null {
  const title = contentIn(request, request.locale).title.trim() || contentIn(request, PRODUCT_SOURCE_LOCALE).title.trim();
  if (!title) return "Give the product a title first.";
  if (request.kind === "description") return descriptionModeBlocker(request.mode, request.locale, request.content, request.parts);
  return null;
}

/** Pure — Claude's answer for Write, built for the parts asked for. */
export function descriptionAnswerSchema(parts: DescriptionParts) {
  return z.object({
    ...(parts !== "body" ? { description: z.string() } : {}),
    ...(parts !== "description" ? { body: z.string() } : {}),
    notes: z.string(),
  });
}

/** Claude's answer for Generate SEO. */
export const SeoAnswerSchema = z.object({
  seoTitle: z.string(),
  seoDescription: z.string(),
  seoAnswer: z.string(),
  notes: z.string(),
});

/** What the route sends back: words to offer, never saved. */
export type ProductAiResult =
  | {
      kind: "description";
      locale: Locale;
      /** Null when not asked for. */
      description: string | null;
      body: string | null;
      /** Claude's note to Staff: what it left out, or what to check. */
      notes: string;
    }
  | { kind: "seo"; locale: Locale; seoTitle: string; seoDescription: string; seoAnswer: string; notes: string };
