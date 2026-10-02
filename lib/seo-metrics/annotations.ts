/** SEO annotations: validation shared by the server action and its tests (slice 05). */

export const ANNOTATION_CATEGORIES = ["seo", "content", "site", "earned", "tracking", "other"] as const;
export type AnnotationCategory = (typeof ANNOTATION_CATEGORIES)[number];

export const ANNOTATION_CATEGORY_LABELS: Record<AnnotationCategory, string> = {
  seo: "SEO change",
  content: "Content",
  site: "Site / domain",
  earned: "Earned mention",
  tracking: "Tracking",
  other: "Other",
};

export type Annotation = {
  id: string;
  date: string;
  label: string;
  category: AnnotationCategory;
  url: string | null;
};

export type AnnotationInput = { date: string; label: string; category: string; url?: string | null };

export function validateAnnotation(
  input: AnnotationInput,
): { ok: true; value: Omit<Annotation, "id"> } | { ok: false; error: string } {
  const date = input.date?.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? "") || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    return { ok: false, error: "Pick a valid date." };
  }
  const label = input.label?.trim() ?? "";
  if (!label) return { ok: false, error: "Add a short label." };
  if (label.length > 120) return { ok: false, error: "Keep the label under 120 characters." };
  if (!(ANNOTATION_CATEGORIES as readonly string[]).includes(input.category)) {
    return { ok: false, error: "Unknown category." };
  }
  const url = input.url?.trim() || null;
  if (url && !/^https?:\/\/\S+$/.test(url)) return { ok: false, error: "Links must start with http:// or https://." };
  return { ok: true, value: { date: date!, label, category: input.category as AnnotationCategory, url } };
}
