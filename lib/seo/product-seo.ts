import { MAX_META_DESCRIPTION_CHARS, MIN_META_DESCRIPTION_CHARS } from "./meta-description";

export const PRODUCT_TITLE_BRAND = "Mpillow";

export const PRODUCT_TITLE_SUFFIX = " | Mpillow Singapore";

export function productPageTitle(name: string): string {
  return name.includes(PRODUCT_TITLE_BRAND) ? name : `${name}${PRODUCT_TITLE_SUFFIX}`;
}

const WIDE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;

export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += WIDE.test(ch) ? 2 : 1;
  return width;
}

const CHINESE_UNITS = /\p{Script=Han}|[\p{Script=Latin}\p{N}]+(?:['’-][\p{Script=Latin}\p{N}]+)*/gu;

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

export const PRODUCT_SEO_TARGETS = {
  title: { min: 25, max: 60 },
  description: { min: MIN_META_DESCRIPTION_CHARS, max: MAX_META_DESCRIPTION_CHARS },
  lede: { words: { min: 60, max: 120 }, characters: { min: 100, max: 220 } },
  shortDescription: { min: 40, max: 160 },
} as const satisfies Record<string, Range | Record<"words" | "characters", Range>>;

export type Fit = "empty" | "short" | "good" | "long";

export function fitOf(n: number, range: Range): Fit {
  if (n === 0) return "empty";
  if (n < range.min) return "short";
  if (n > range.max) return "long";
  return "good";
}
