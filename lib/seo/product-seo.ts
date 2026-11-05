import { MAX_META_DESCRIPTION_CHARS, MIN_META_DESCRIPTION_CHARS } from "./meta-description";

/**
 * How a Storefront product's search listing is measured: the title the page
 * really shows, how wide its words are in a search result, and the lengths
 * each SEO field aims for. Pure: the product editor's counters and its search
 * preview read it in the browser, and ✨ Generate SEO's checks on the server,
 * so what Staff are shown and what Claude is held to are the same numbers.
 */

/** The brand a product page's title carries. */
export const PRODUCT_TITLE_BRAND = "Mpillow";

/** What the product page adds after a title that doesn't already name the brand. */
export const PRODUCT_TITLE_SUFFIX = " | Mpillow Singapore";

/**
 * Pure — the product page's `<title>` for `name` (its SEO title, else its
 * title): the name, then the brand unless the name already says it. The
 * product layout (app/[lang]/shop/[slug]/layout.tsx) renders exactly this.
 */
export function productPageTitle(name: string): string {
  return name.includes(PRODUCT_TITLE_BRAND) ? name : `${name}${PRODUCT_TITLE_SUFFIX}`;
}

/** East Asian wide and full-width characters: Han, kana, Hangul, full-width forms and CJK punctuation. */
const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

/**
 * Pure — how wide some words are in a search result, in Latin letters: a
 * Chinese character or full-width mark takes about the room of two. A search
 * result cuts a title or a description by width, not by count, so this is
 * what the limits below measure. For English it is the length.
 */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

/** Han characters and runs of Latin letters or digits: how a Chinese lede is counted ("Mpillow 高级枕" is four). */
const CHINESE_UNITS = /\p{Script=Han}|[\p{Script=Latin}\p{N}]+(?:['’-][\p{Script=Latin}\p{N}]+)*/gu;

/** Pure — how long a lede or body is, in the unit its language is counted in. */
export function countWords(text: string, counts: "words" | "characters"): number {
  const t = text.trim();
  if (!t) return 0;
  if (counts === "characters") return t.match(CHINESE_UNITS)?.length ?? 0;
  return t.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export interface Range {
  min: number;
  max: number;
}

/**
 * What each field aims for. Widths are in Latin letters (`displayWidth`), so
 * one number serves English and Chinese alike; a lede is counted in words in
 * English and in characters in Chinese (60 to 120 words reads as roughly 100
 * to 220 characters).
 */
export const PRODUCT_SEO_TARGETS = {
  /** The whole `<title>`, the suffix included: search results cut it at about 60 letters. */
  title: { min: 25, max: 60 },
  /** The meta description, as the site's own pages are held to (meta-description.ts). */
  description: { min: MIN_META_DESCRIPTION_CHARS, max: MAX_META_DESCRIPTION_CHARS },
  /** The answer lede under the product's title (resolveAnswerLede). */
  lede: { words: { min: 60, max: 120 }, characters: { min: 100, max: 220 } },
  /** The short description on shop listings. */
  shortDescription: { min: 40, max: 160 },
} as const satisfies Record<string, Range | Record<"words" | "characters", Range>>;

export type Fit = "empty" | "short" | "good" | "long";

/** Pure — where `n` sits against `range`. */
export function fitOf(n: number, range: Range): Fit {
  if (n === 0) return "empty";
  if (n < range.min) return "short";
  if (n > range.max) return "long";
  return "good";
}
