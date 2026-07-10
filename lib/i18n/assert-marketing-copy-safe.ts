/**
 * Claims / SEO / copy-fit gate for marketing surfaces.
 * Banned clinical verbs + Singapore/cervical intent + hero H1 + Answer lede bands.
 * Bands: CONTEXT.md “Copy fit” — H1 ≤2 lines, hero lede ≤4 lines.
 */
import assert from "node:assert/strict";

export const BANNED_CLINICAL = /\b(prescribe|treat|cure|rehab)\b/i;

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

export type GatedString = {
  label: string;
  text: string;
  /** SEO-flagged surfaces should name Singapore and/or cervical/neck intent. */
  requireSingaporeOrCervical?: boolean;
};

export function wordCount(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Throws AssertionError if any gated string fails claims/SEO/copy-fit rules. */
export function assertMarketingCopySafe(
  strings: GatedString[],
  opts?: {
    heroH1?: string;
    heroSubtitle?: string;
    heroSeoAnswer?: string;
    heroWordMin?: number;
    heroWordMax?: number;
  }
) {
  for (const { label, text, requireSingaporeOrCervical } of strings) {
    assert.doesNotMatch(text, BANNED_CLINICAL, `${label}: banned clinical verb`);
    if (requireSingaporeOrCervical) {
      assert.match(
        text,
        /Singapore|cervical|neck pain|neck comfort|tech neck/i,
        `${label}: expected Singapore or cervical/neck intent`
      );
    }
  }

  if (opts?.heroH1 != null) {
    const h1 = opts.heroH1.trim();
    const w = wordCount(h1);
    assert.ok(
      w >= HERO_H1_WORD_MIN && w <= HERO_H1_WORD_MAX,
      `hero H1 word count ${w} (need ${HERO_H1_WORD_MIN}–${HERO_H1_WORD_MAX} for ≤2 lines)`
    );
    assert.ok(
      h1.length <= HERO_H1_CHAR_MAX,
      `hero H1 chars ${h1.length} (max ${HERO_H1_CHAR_MAX} for ≤2 lines)`
    );
    assert.doesNotMatch(h1, BANNED_CLINICAL, "hero H1: banned clinical verb");
  }

  if (opts?.heroSubtitle != null && opts.heroSubtitle.trim() !== "") {
    const w = wordCount(opts.heroSubtitle);
    assert.ok(w <= HERO_SUBTITLE_WORD_MAX, `hero subtitle words ${w} (max ${HERO_SUBTITLE_WORD_MAX})`);
    assert.doesNotMatch(opts.heroSubtitle, BANNED_CLINICAL, "hero subtitle: banned clinical verb");
  }

  if (opts?.heroSeoAnswer != null) {
    const min = opts.heroWordMin ?? HERO_LEDE_WORD_MIN;
    const max = opts.heroWordMax ?? HERO_LEDE_WORD_MAX;
    const w = wordCount(opts.heroSeoAnswer);
    assert.ok(w >= min && w <= max, `hero seoAnswer word count ${w} (need ${min}–${max} for ≤4 lines)`);
    assert.doesNotMatch(opts.heroSeoAnswer, BANNED_CLINICAL, "hero seoAnswer: banned clinical verb");
  }
}
