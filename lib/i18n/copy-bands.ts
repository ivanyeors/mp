/**
 * Copy-fit bands for marketing surfaces — CONTEXT.md **Copy fit (layout + SEO)**.
 *
 * Deliberately client-safe: no `node:` imports, so the Page Builder inspector can show
 * a live meter against the same numbers the build-time gate enforces (the same reason
 * `lib/config-upload/limits.ts` is split out). `assert-marketing-copy-safe.ts` re-exports
 * everything here, so the bands have exactly one definition.
 */

export const BANNED_CLINICAL = /\b(prescribe|treat|cure|rehab)\b/i;

/**
 * The same claims in Chinese (PRD-campaign-email-editor slice 17): a
 * campaign's 中文 version is checked against these as its English is against
 * BANNED_CLINICAL. Chinese has no word breaks, so each is matched anywhere.
 */
export const BANNED_CLINICAL_ZH = /治疗|治愈|疗效|缓解|康复|处方|临床|医生推荐/;

/** Hero H1: ≤2 lines at max-w-xl + md:text-6xl ≈ ≤8 words / ≤55 chars (taglines may be 4–5). */
export const HERO_H1_WORD_MIN = 4;
export const HERO_H1_WORD_MAX = 8;
export const HERO_H1_CHAR_MAX = 55;

/**
 * Hero Answer lede: ≤4 lines at max-w-prose / text-lg ≈ 28–40 words.
 * (Non-hero Answer ledes elsewhere may still target 40–60 for AEO peak.)
 */
export const HERO_LEDE_WORD_MIN = 28;
export const HERO_LEDE_WORD_MAX = 40;

export const HERO_SUBTITLE_WORD_MAX = 12;

export function wordCount(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/**
 * How a governed field is measured, so the inspector can render a meter without
 * knowing which band applies to which field.
 */
export type BandUnit = "words" | "chars";

export interface CopyBand {
  unit: BandUnit;
  min?: number;
  max: number;
}

export const HERO_H1_WORD_BAND: CopyBand = {
  unit: "words",
  min: HERO_H1_WORD_MIN,
  max: HERO_H1_WORD_MAX,
};
export const HERO_H1_CHAR_BAND: CopyBand = { unit: "chars", max: HERO_H1_CHAR_MAX };
export const HERO_SUBTITLE_BAND: CopyBand = { unit: "words", max: HERO_SUBTITLE_WORD_MAX };
export const HERO_LEDE_BAND: CopyBand = {
  unit: "words",
  min: HERO_LEDE_WORD_MIN,
  max: HERO_LEDE_WORD_MAX,
};

export function measure(text: string, unit: BandUnit): number {
  return unit === "words" ? wordCount(text) : text.trim().length;
}

/**
 * Check one string against one band. Returns a message naming the field, the band and
 * what the value actually measured — an operator needs to know by how much to compress,
 * not just that it failed.
 */
export function checkBand(label: string, text: string, band: CopyBand): string | null {
  const value = measure(text, band.unit);
  if (band.min !== undefined && value < band.min) {
    return `${label} is ${value} ${band.unit}, needs at least ${band.min}.`;
  }
  if (value > band.max) {
    return `${label} is ${value} ${band.unit}, limit is ${band.max}.`;
  }
  return null;
}

/** Check one string for banned clinical claims. */
export function checkBannedClinical(label: string, text: string): string | null {
  const match = text.match(BANNED_CLINICAL);
  return match ? `${label} contains "${match[0]}", which we cannot claim.` : null;
}

/** Check one string of Chinese for banned clinical claims. */
export function checkBannedClinicalZh(label: string, text: string): string | null {
  const match = text.match(BANNED_CLINICAL_ZH);
  return match ? `${label} contains "${match[0]}", which we cannot claim.` : null;
}
