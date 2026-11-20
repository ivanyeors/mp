const CLOSING_MARKS = "[:;,.!?：；，。！？、」』）》”’\"']";
const OPENING_MARKS = "[「『（《“‘\"']";
const LETTER = /[\p{L}\p{N}]/u;

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
