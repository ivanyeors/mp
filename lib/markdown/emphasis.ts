/**
 * Bold and italic written so CommonMark renders them, on their own: the
 * product page uses this with `ReactMarkdown`, and must not carry the
 * editor's TipTap to do it (product-markdown.ts re-exports it). Pure.
 */

/** Sentence marks that may end a bold or italic run, and the brackets and quotes that may open one. */
const CLOSING_MARKS = "[:;,.!?：；，。！？、」』）》”’\"']";
const OPENING_MARKS = "[「『（《“‘\"']";
const LETTER = /[\p{L}\p{N}]/u;

/**
 * Pure — bold and italic that CommonMark would print as stars, written so
 * they render. A run that ends in a mark right before a letter
 * (`**双层泡沫：**底层`) or starts with one right after a letter isn't
 * emphasis to CommonMark, which is how Chinese is usually written: the shop
 * would show the stars. The mark moves outside the run (`**双层泡沫**：底层`),
 * which reads the same and renders.
 */
export function fixEmphasisFlanking(md: string): string {
  const close = new RegExp(`${CLOSING_MARKS}+$`, "u");
  const open = new RegExp(`^${OPENING_MARKS}+`, "u");
  const fix = (delim: string) => (run: string, inner: string, at: number, whole: string) => {
    const before = whole[at - 1] ?? " ";
    const after = whole[at + run.length] ?? " ";
    let core = inner;
    let lead = "";
    let trail = "";
    const t = LETTER.test(after) ? close.exec(core) : null;
    if (t && t[0].length < core.length) {
      trail = t[0];
      core = core.slice(0, -trail.length);
    }
    const l = LETTER.test(before) ? open.exec(core) : null;
    if (l && l[0].length < core.length) {
      lead = l[0];
      core = core.slice(lead.length);
    }
    return `${lead}${delim}${core}${delim}${trail}`;
  };
  return md
    .replace(/(?<!\\)\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/gu, fix("**"))
    .replace(/(?<![*\\])\*(?=[^\s*])([^*\n]+?)(?<=[^\s*\\])\*(?!\*)/gu, fix("*"));
}
