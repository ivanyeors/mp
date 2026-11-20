export const AA_NORMAL_TEXT = 4.5;
export const AA_LARGE_TEXT = 3;

export const DEFAULT_COVERAGE = 0.95;

export type TextTone = "light" | "dark";

export const TONE_RGB: Record<TextTone, readonly [number, number, number]> = {
  light: [255, 255, 255],
  dark: [10, 10, 10],
};

const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

export function relativeLuminance(r: number, g: number, b: number): number {
  return 0.2126 * LINEAR[clampByte(r)] + 0.7152 * LINEAR[clampByte(g)] + 0.0722 * LINEAR[clampByte(b)];
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

export function requiredRatio(fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  return large ? AA_LARGE_TEXT : AA_NORMAL_TEXT;
}

export interface ContrastRegion {
  pixels: ArrayLike<number>;
  minRatio: number;
}

export interface ToneDecision {
  tone: TextTone;
  passes: boolean;
}

export function legiblePixels(region: ContrastRegion, tone: TextTone): number {
  const { pixels, minRatio } = region;
  const text = relativeLuminance(...TONE_RGB[tone]);
  let count = 0;
  for (let o = 0; o + 3 < pixels.length; o += 4) {
    if (contrastRatio(text, relativeLuminance(pixels[o], pixels[o + 1], pixels[o + 2])) >= minRatio) count++;
  }
  return count;
}

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
