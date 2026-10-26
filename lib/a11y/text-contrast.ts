/**
 * WCAG 2.x contrast for text laid over a photograph.
 *
 * A photo has no single background colour, so "does this text pass?" is asked of
 * each pixel under the text. The tone (white or near-black text) is the one that
 * meets the WCAG AA ratio over more of those pixels; it passes when it meets it
 * over `coverage` of every block of text.
 *
 * Pure: callers hand in RGBA bytes (an `ImageData.data`), so this runs in tests.
 */

/** WCAG AA minimum for body text. */
export const AA_NORMAL_TEXT = 4.5;
/** WCAG AA minimum for large text: ≥ 24px, or ≥ 18.66px at weight 700+. */
export const AA_LARGE_TEXT = 3;

/**
 * Share of the pixels under a text block that must meet the ratio. Not 100%: the
 * samples are already averaged over glyph-sized cells, and one specular highlight
 * should not fail a whole block.
 */
export const DEFAULT_COVERAGE = 0.95;

export type TextTone = "light" | "dark";

/** The text colour each tone renders, as sRGB bytes. */
export const TONE_RGB: Record<TextTone, readonly [number, number, number]> = {
  light: [255, 255, 255], // white
  dark: [10, 10, 10], // neutral-950
};

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

/** WCAG relative luminance of an sRGB colour given as 0–255 channels. */
export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[clampByte(r)] + 0.7152 * LINEAR[clampByte(g)] + 0.0722 * LINEAR[clampByte(b)];
}

/** WCAG contrast ratio between two relative luminances (order does not matter). */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** The ratio text of this computed size and weight must meet under WCAG AA. */
export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? AA_LARGE_TEXT : AA_NORMAL_TEXT;
}

export interface ContrastRegion {
  /** RGBA bytes of the background under the text, as in `ImageData.data`. */
  pixels: ArrayLike<number>;
  /** The ratio this text must meet: `AA_NORMAL_TEXT` or `AA_LARGE_TEXT`. */
  minRatio: number;
}

export interface ToneDecision {
  tone: TextTone;
  /** Every region meets its AA minimum in this tone. */
  passes: boolean;
}

/** How many of the region's pixels `tone` text meets the region's ratio over. */
export function legiblePixels(region: ContrastRegion, tone: TextTone): number {
  const { pixels, minRatio } = region;
  const text = relativeLuminance(...TONE_RGB[tone]);
  let count = 0;
  for (let o = 0; o + 3 < pixels.length; o += 4) {
    if (contrastRatio(text, relativeLuminance(pixels[o], pixels[o + 1], pixels[o + 2])) >= minRatio) count++;
  }
  return count;
}

/**
 * Pick the tone legible over more of the copy, and whether it reaches AA: at least
 * `coverage` of every region. White wins a tie: it reads better over most photography.
 */
export function decideTextTone(regions: ContrastRegion[], coverage = DEFAULT_COVERAGE): ToneDecision {
  const sizes = regions.map((r) => Math.floor(r.pixels.length / 4));
  const judge = (tone: TextTone) => {
    const legible = regions.map((r) => legiblePixels(r, tone));
    return {
      legible: legible.reduce((a, b) => a + b, 0),
      passes: legible.every((n, i) => n >= sizes[i] * coverage),
    };
  };
  const light = judge("light");
  const dark = judge("dark");
  return dark.legible > light.legible ? { tone: "dark", passes: dark.passes } : { tone: "light", passes: light.passes };
}

function clampByte(v: number): number {
  return v <= 0 ? 0 : v >= 255 ? 255 : Math.round(v);
}
