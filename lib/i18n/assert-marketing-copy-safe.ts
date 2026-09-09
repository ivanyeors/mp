/**
 * Claims / SEO / copy-fit gate for marketing surfaces.
 * Banned clinical verbs + Singapore/cervical intent + hero H1 + Answer lede bands.
 * Bands: CONTEXT.md “Copy fit” — H1 ≤2 lines, hero lede ≤4 lines.
 *
 * The bands themselves live in `./copy-bands`, which is client-safe, so the Page
 * Builder inspector can meter against the same numbers this gate enforces. They are
 * re-exported here so existing importers are unaffected.
 */
import assert from "node:assert/strict";

import {
  BANNED_CLINICAL,
  HERO_H1_CHAR_BAND,
  HERO_H1_CHAR_MAX,
  HERO_H1_WORD_BAND,
  HERO_H1_WORD_MAX,
  HERO_H1_WORD_MIN,
  HERO_LEDE_WORD_MAX,
  HERO_LEDE_WORD_MIN,
  HERO_SUBTITLE_BAND,
  HERO_SUBTITLE_WORD_MAX,
  checkBand,
  wordCount,
} from "./copy-bands";

export {
  BANNED_CLINICAL,
  HERO_H1_CHAR_MAX,
  HERO_H1_WORD_MAX,
  HERO_H1_WORD_MIN,
  HERO_LEDE_WORD_MAX,
  HERO_LEDE_WORD_MIN,
  HERO_SUBTITLE_WORD_MAX,
  wordCount,
};

export type GatedString = {
  label: string;
  text: string;
  /** SEO-flagged surfaces should name Singapore and/or cervical/neck intent. */
  requireSingaporeOrCervical?: boolean;
};

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
    assert.equal(checkBand("hero H1", h1, HERO_H1_WORD_BAND), null, `hero H1 word count out of band: ${h1}`);
    assert.equal(checkBand("hero H1", h1, HERO_H1_CHAR_BAND), null, `hero H1 chars out of band: ${h1}`);
    assert.doesNotMatch(h1, BANNED_CLINICAL, "hero H1: banned clinical verb");
  }

  if (opts?.heroSubtitle != null && opts.heroSubtitle.trim() !== "") {
    assert.equal(
      checkBand("hero subtitle", opts.heroSubtitle, HERO_SUBTITLE_BAND),
      null,
      "hero subtitle out of band",
    );
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
