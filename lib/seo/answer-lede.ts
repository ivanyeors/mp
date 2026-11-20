const MAX_LEDE_CHARS = 600;

export type AnswerLedeFields = {
  seo_answer?: string | null;
  seo_description?: string | null;
  description?: string | null;
};

export function resolveAnswerLede(fields: AnswerLedeFields): string | null {
  const raw =
    fields.seo_answer?.trim() ||
    fields.seo_description?.trim() ||
    fields.description?.trim() ||
    null;
  if (!raw) return null;
  if (raw.length <= MAX_LEDE_CHARS) return raw;
  const cut = raw.slice(0, MAX_LEDE_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 80 ? cut.slice(0, lastSpace) : cut).trimEnd() + "…";
}
