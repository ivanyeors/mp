import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";

/**
 * The languages a Storefront product is written in, in the order the product
 * editor shows them: one tab each in its Content and SEO cards, and the
 * language Claude writes in when asked from that tab. Pure: the editor
 * imports it in the browser, the AI writing route on the server.
 *
 * The list is the site's own (`SUPPORTED_LOCALES`), so a language added there
 * gets a tab in both cards without touching the editor. The record below is
 * keyed by `Locale`, so adding one fails to compile until it has its label
 * and the words Claude is told to write in.
 */

export interface ProductLocale {
  code: Locale;
  /** The tab's label, in its own language: "English", "中文". */
  label: string;
  /** Short, for field labels: "EN", "ZH". */
  short: string;
  /** What Claude is asked to write in. */
  language: string;
  /** How its words are counted: by words, or by characters (Chinese has no spaces). */
  counts: "words" | "characters";
}

const LOCALE_DETAILS: Record<Locale, Omit<ProductLocale, "code">> = {
  "en-US": { label: "English", short: "EN", language: "English, as Singapore writes it, with British spelling", counts: "words" },
  "zh-CN": { label: "中文", short: "ZH", language: "Simplified Chinese, as our Chinese website writes it for readers in Singapore", counts: "characters" },
};

export const PRODUCT_LOCALES: readonly ProductLocale[] = SUPPORTED_LOCALES.map((code) => ({ code, ...LOCALE_DETAILS[code] }));

/** The language every product is written in first; the others are translated from it. */
export const PRODUCT_SOURCE_LOCALE: Locale = DEFAULT_LOCALE;

export function productLocale(code: Locale): ProductLocale {
  return PRODUCT_LOCALES.find((l) => l.code === code) ?? PRODUCT_LOCALES[0];
}
