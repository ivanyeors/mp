import type { BlogLocalizedContent } from "@/lib/blogs";

export function preserveSeoAnswer(
  existing: Record<string, BlogLocalizedContent> | null | undefined,
  incoming: Record<string, BlogLocalizedContent>,
): Record<string, BlogLocalizedContent> {
  const out: Record<string, BlogLocalizedContent> = {};
  for (const [locale, loc] of Object.entries(incoming)) {
    const kept = existing?.[locale]?.seo_answer;
    out[locale] = loc.seo_answer === undefined && kept !== undefined ? { ...loc, seo_answer: kept } : loc;
  }
  return out;
}

export function isEditorialChange(
  existing: Record<string, BlogLocalizedContent> | null | undefined,
  incoming: Record<string, BlogLocalizedContent>,
): boolean {
  const fields = ["title", "sub_header", "description", "body", "seo_answer"] as const;
  return Object.entries(incoming).some(([locale, loc]) =>
    fields.some((f) => (loc[f] ?? "") !== (existing?.[locale]?.[f] ?? "")),
  );
}
