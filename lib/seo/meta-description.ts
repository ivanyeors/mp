export const MAX_META_DESCRIPTION_CHARS = 155;

export const MIN_META_DESCRIPTION_CHARS = 110;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&nbsp;": " ", "&quot;": '"', "&#39;": "'", "&lt;": "<", "&gt;": ">" };

export function markdownToPlainText(markdown: string): string {
  return markdown
    .split("\n")
    .filter((line) => !/^\s*#{1,6}\s/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*+>]|\d+\.)\s+/, ""))
    .join(" ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(amp|nbsp|quot|#39|lt|gt);/g, (entity) => ENTITIES[entity] ?? entity)
    .replace(/(\*\*|__|\*|_|`)(\S(?:.*?\S)?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const head = lastSpace > max / 2 ? cut.slice(0, lastSpace) : cut;
  return head.replace(/[\s,;:.–—-]+$/, "") + "…";
}

export function resolveMetaDescription(fields: {
  description?: string | null;
  seo_answer?: string | null;
  body?: string | null;
}): string {
  const written = fields.description?.trim();
  if (written) return written;
  const derived = markdownToPlainText(fields.seo_answer?.trim() || dropLeadingLabels(fields.body ?? ""));
  return clampAtWord(derived, MAX_META_DESCRIPTION_CHARS);
}

function dropLeadingLabels(body: string): string {
  const lines = body.split("\n");
  let start = 0;
  while (start < lines.length) {
    const line = lines[start].trim();
    if (line && (line.length >= 40 || /[.!?:]$/.test(line))) break;
    start++;
  }
  return start < lines.length ? lines.slice(start).join("\n") : body;
}
