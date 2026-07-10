/**
 * Claims / SEO gate for marketing copy rewrite surfaces.
 * Banned clinical verbs + optional Singapore/cervical intent + hero Answer lede band.
 */
import assert from "node:assert/strict";

export const BANNED_CLINICAL = /\b(prescribe|treat|cure|rehab)\b/i;

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

/** Throws AssertionError if any gated string fails claims/SEO rules. */
export function assertMarketingCopySafe(
  strings: GatedString[],
  opts?: { heroSeoAnswer?: string; heroWordMin?: number; heroWordMax?: number }
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

  if (opts?.heroSeoAnswer != null) {
    const min = opts.heroWordMin ?? 60;
    const max = opts.heroWordMax ?? 120;
    const w = wordCount(opts.heroSeoAnswer);
    assert.ok(w >= min && w <= max, `hero seoAnswer word count ${w} (need ${min}–${max})`);
    assert.doesNotMatch(opts.heroSeoAnswer, BANNED_CLINICAL, "hero seoAnswer: banned clinical verb");
  }
}
