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

/**
 * Copy-fit gate for Landing section overrides — CONTEXT.md **Copy fit (layout + SEO)**.
 *
 * The bands were already implemented and already enforced over the i18n literals, but
 * the string that actually ships on the homepage is the CMS override, and that path had
 * no validation at all: a 300-character headline, or copy claiming to "treat" or "cure",
 * saved cleanly and went live. This runs the same bands over what an override will
 * actually render.
 */

export interface CopyFitIssue {
  /** The content key the operator must fix, e.g. `titleEmphasis`. */
  field: string;
  locale: Locale;
  message: string;
}

/** Text fields on the hero whose value is operator-editable. */
const HERO_TEXT_FIELDS = ["titlePrefix", "titleEmphasis", "titleSuffix", "subtitle"] as const;

/**
 * The `<h1>` is three fields concatenated (see `hero-section.tsx`), so the band applies
 * to the composed string — checking each part alone would reject a legitimate two-word
 * prefix. zh-CN joins without spaces.
 */
function composeHeroH1(parts: Array<string | undefined>, locale: Locale): string {
  const sep = locale === "zh-CN" ? "" : " ";
  return parts.filter((p): p is string => Boolean(p && p.trim())).join(sep).trim();
}

function asText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Validate a hero section's stored content, for every locale it carries copy in.
 *
 * Overrides are merged over the i18n defaults first, because that is what renders: an
 * operator who overrides only `titlePrefix` still ships the default emphasis and suffix
 * beside it, and clearing an override must pass (the default is already known-good).
 *
 * Word and character bands are en-US only — CONTEXT.md defines them for en-US, and
 * whitespace word-counting is meaningless for Chinese. Banned-claim checks run on every
 * locale.
 */
export function validateHeroContent(content: Record<string, unknown>): CopyFitIssue[] {
  const issues: CopyFitIssue[] = [];

  for (const locale of SUPPORTED_LOCALES) {
    const resolved = resolveContentLocale(content, locale);
    const hero = getMessages(locale).home.hero;

    // Nothing overridden for this locale — the i18n default stands, and it is gated
    // separately by the marketing-copy checks.
    const overridden = HERO_TEXT_FIELDS.filter((f) => asText(resolved[f]) !== undefined);
    if (overridden.length === 0) continue;

    const titlePrefix = asText(resolved.titlePrefix) ?? hero.titlePrefix;
    const titleEmphasis = asText(resolved.titleEmphasis) ?? hero.titleEmphasis;
    const titleSuffix = asText(resolved.titleSuffix) ?? hero.titleSuffix;
    const subtitle = asText(resolved.subtitle) ?? hero.subtitle;

    const h1 = composeHeroH1([titlePrefix, titleEmphasis, titleSuffix], locale);

    // Attribute an H1 failure to a field the operator actually edited, so the error
    // points at an input they can see.
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

/** Validate the content of one section, by type. Non-hero types are ungated for now. */
export function validateSectionCopy(
  sectionType: string,
  content: Record<string, unknown>,
): CopyFitIssue[] {
  return sectionType === "hero" ? validateHeroContent(content) : [];
}

/** One line per issue, for an API error an operator can act on. */
export function formatCopyFitIssues(issues: CopyFitIssue[]): string {
  return issues.map((i) => `${i.message} (${i.locale})`).join(" ");
}
