import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/locales";
import { getMessages } from "@/lib/i18n/messages";
import {
  HERO_H1_CHAR_BAND,
  HERO_H1_WORD_BAND,
  HERO_SUBTITLE_BAND,
  checkBand,
  checkBannedClinical,
} from "@/lib/i18n/copy-bands";
import { resolveContentLocale } from "@/lib/page-builder/locale";

export interface CopyFitIssue {
  field: string;
  locale: Locale;
  message: string;
}

const HERO_TEXT_FIELDS = ["titlePrefix", "titleEmphasis", "titleSuffix", "subtitle"] as const;

function composeHeroH1(parts: Array<string | undefined>, locale: Locale): string {
  const sep = locale === "zh-CN" ? "" : " ";
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep).trim();
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

export function validateHeroContent(content: Record<string, unknown>): CopyFitIssue[] {
  const issues: CopyFitIssue[] = [];

  for (const locale of SUPPORTED_LOCALES) {
    const resolved = resolveContentLocale(content, locale);
    const hero = getMessages(locale).home.hero;

    const overridden = HERO_TEXT_FIELDS.filter((f) => asText(resolved[f]) !== undefined);
    if (overridden.length === 0) continue;

    const titlePrefix = asText(resolved.titlePrefix) ?? hero.titlePrefix;
    const titleEmphasis = asText(resolved.titleEmphasis) ?? hero.titleEmphasis;
    const titleSuffix = asText(resolved.titleSuffix) ?? hero.titleSuffix;
    const subtitle = asText(resolved.subtitle) ?? hero.subtitle;

    const h1 = composeHeroH1([titlePrefix, titleEmphasis, titleSuffix], locale);

    const h1Field =
      overridden.find((f) => f !== "subtitle") ?? "titleEmphasis";

    if (locale === DEFAULT_LOCALE && h1) {
      for (const band of [HERO_H1_WORD_BAND, HERO_H1_CHAR_BAND]) {
        const message = checkBand("Headline", h1, band);
        if (message) issues.push({ field: h1Field, locale, message });
      }
    }

    if (locale === DEFAULT_LOCALE && subtitle) {
      const message = checkBand("Subtitle", subtitle, HERO_SUBTITLE_BAND);
      if (message) issues.push({ field: "subtitle", locale, message });
    }

    for (const field of HERO_TEXT_FIELDS) {
      const text = asText(resolved[field]);
      if (!text) continue;
      const message = checkBannedClinical(field === "subtitle" ? "Subtitle" : "Headline", text);
      if (message) issues.push({ field, locale, message });
    }
  }

  return issues;
}

export function validateSectionCopy(
  sectionType: string,
  content: Record<string, unknown>,
): CopyFitIssue[] {
  return sectionType === "hero" ? validateHeroContent(content) : [];
}

export function formatCopyFitIssues(issues: CopyFitIssue[]): string {
  return issues.map((i) => `${i.message} (${i.locale})`).join(" ");
}
