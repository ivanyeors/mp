export const BANNED_CLINICAL = /\b(prescribe|treat|cure|rehab)\b/i;

export const BANNED_CLINICAL_ZH = /治疗|治愈|疗效|缓解|康复|处方|临床|医生推荐/;

export const HERO_H1_WORD_MIN = 4;
export const HERO_H1_WORD_MAX = 8;
export const HERO_H1_CHAR_MAX = 55;

export const HERO_LEDE_WORD_MIN = 28;
export const HERO_LEDE_WORD_MAX = 40;

export const HERO_SUBTITLE_WORD_MAX = 12;

export function wordCount(s: string) {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

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

export function checkBannedClinical(label: string, text: string): string | null {
  const match = text.match(BANNED_CLINICAL);
  return match ? `${label} contains "${match[0]}", which we cannot claim.` : null;
}

export function checkBannedClinicalZh(label: string, text: string): string | null {
  const match = text.match(BANNED_CLINICAL_ZH);
  return match ? `${label} contains "${match[0]}", which we cannot claim.` : null;
}
