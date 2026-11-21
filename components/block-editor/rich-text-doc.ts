export type RichTextWords = { text: string; bold?: true; italic?: true; href?: string };
export type RichTextVariableRun = { var: string };
export type RichTextRun = RichTextWords | RichTextVariableRun;

export type RichTextParagraph = { kind: "p"; runs: RichTextRun[] } | { kind: "bullets"; items: RichTextRun[][] };

export type RichTextValue = RichTextParagraph[];

export interface RichTextVariable {
  key: string;
  label: string;
  description?: string;
  disabledReason?: string | null;
}

export const RICH_TEXT_NODES = {
  variable: "variable",
  hardBreak: "hardBreak",
  paragraph: "paragraph",
  bulletList: "bulletList",
  listItem: "listItem",
} as const;

export interface DocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: DocNode[];
}

const sameMarks = (a: RichTextWords, b: RichTextWords) => a.bold === b.bold && a.italic === b.italic && a.href === b.href;

function pushRun(out: RichTextRun[], r: RichTextRun) {
  if (!("text" in r) || !r.text) {
    if ("var" in r) out.push(r);
    return;
  }
  const last = out.at(-1);
  if (last && "text" in last && sameMarks(last, r)) last.text += r.text;
  else out.push({ ...r });
}

const words = (text: string, m: Omit<RichTextWords, "text">): RichTextWords => ({
  text,
  ...(m.bold ? { bold: true as const } : {}),
  ...(m.italic ? { italic: true as const } : {}),
  ...(m.href ? { href: m.href } : {}),
});

function marksOf(node: DocNode): Omit<RichTextWords, "text"> {
  const m: Omit<RichTextWords, "text"> = {};
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") m.bold = true;
    else if (mark.type === "italic") m.italic = true;
    else if (mark.type === "link" && typeof mark.attrs?.href === "string" && mark.attrs.href) m.href = mark.attrs.href;
  }
  return m;
}

const hasWords = (runs: readonly RichTextRun[]) => runs.some((r) => "var" in r || r.text.trim());

function inlineRuns(node: DocNode, offered: ReadonlySet<string> | null, out: RichTextRun[]) {
  for (const child of node.content ?? []) {
    if (child.type === "text") pushRun(out, words(child.text ?? "", marksOf(child)));
    else if (child.type === RICH_TEXT_NODES.hardBreak) pushRun(out, words("\n", marksOf(child)));
    else if (child.type === RICH_TEXT_NODES.variable) {
      const key = typeof child.attrs?.key === "string" ? child.attrs.key : "";
      if (!key) continue;
      if (!offered || offered.has(key)) out.push({ var: key });
      else pushRun(out, { text: `{${key}}` });
    } else if (child.content) {
      if (out.length) pushRun(out, { text: "\n" });
      inlineRuns(child, offered, out);
    }
  }
}

function listItems(list: DocNode, offered: ReadonlySet<string> | null, items: RichTextRun[][]) {
  for (const item of list.content ?? []) {
    const runs: RichTextRun[] = [];
    const nested: DocNode[] = [];
    for (const part of item.content ?? []) {
      if (part.type === RICH_TEXT_NODES.bulletList || part.type === "orderedList") nested.push(part);
      else {
        if (runs.length) pushRun(runs, { text: "\n" });
        inlineRuns(part, offered, runs);
      }
    }
    if (hasWords(runs)) items.push(runs);
    for (const n of nested) listItems(n, offered, items);
  }
}

export function valueFromDoc(doc: DocNode, variables?: readonly RichTextVariable[]): RichTextValue {
  const offered = variables ? new Set(variables.map((v) => v.key)) : null;
  const out: RichTextValue = [];
  const walk = (nodes: readonly DocNode[]) => {
    for (const node of nodes) {
      if (node.type === RICH_TEXT_NODES.bulletList || node.type === "orderedList") {
        const items: RichTextRun[][] = [];
        listItems(node, offered, items);
        if (!items.length) continue;
        const last = out.at(-1);
        if (last?.kind === "bullets") last.items.push(...items);
        else out.push({ kind: "bullets", items });
      } else if (node.type === RICH_TEXT_NODES.paragraph || !node.content?.some((c) => c.content)) {
        const runs: RichTextRun[] = [];
        inlineRuns(node, offered, runs);
        if (hasWords(runs)) out.push({ kind: "p", runs });
      } else walk(node.content ?? []);
    }
  };
  walk(doc.content ?? []);
  return out;
}

function runNodes(r: RichTextRun): DocNode[] {
  if ("var" in r) return [{ type: RICH_TEXT_NODES.variable, attrs: { key: r.var } }];
  const marks: NonNullable<DocNode["marks"]> = [];
  if (r.bold) marks.push({ type: "bold" });
  if (r.italic) marks.push({ type: "italic" });
  if (r.href) marks.push({ type: "link", attrs: { href: r.href } });
  const withMarks = (n: DocNode): DocNode => (marks.length ? { ...n, marks } : n);
  const out: DocNode[] = [];
  r.text.split("\n").forEach((line, i) => {
    if (i > 0) out.push({ type: RICH_TEXT_NODES.hardBreak });
    if (line) out.push(withMarks({ type: "text", text: line }));
  });
  return out;
}

const paragraphNode = (runs: readonly RichTextRun[]): DocNode => {
  const content = runs.flatMap(runNodes);
  return content.length ? { type: RICH_TEXT_NODES.paragraph, content } : { type: RICH_TEXT_NODES.paragraph };
};

export function docFromValue(value: RichTextValue): DocNode {
  const content = value.map((p): DocNode =>
    p.kind === "p"
      ? paragraphNode(p.runs)
      : {
          type: RICH_TEXT_NODES.bulletList,
          content: p.items.map((item) => ({ type: RICH_TEXT_NODES.listItem, content: [paragraphNode(item)] })),
        },
  );
  return { type: "doc", content: content.length ? content : [{ type: RICH_TEXT_NODES.paragraph }] };
}

export function richTextWords(value: RichTextValue): string {
  const line = (runs: readonly RichTextRun[]) => runs.map((r) => ("var" in r ? `{${r.var}}` : r.text)).join("");
  return value.map((p) => (p.kind === "p" ? line(p.runs) : p.items.map(line).join("\n"))).join("\n\n");
}

const WRITTEN_VARIABLE = /\{([a-z][a-z0-9_]*)\}/g;

export function richTextFromWords(text: string, variables: readonly RichTextVariable[]): RichTextValue {
  const offered = new Set(variables.map((v) => v.key));
  const out: RichTextValue = [];
  for (const para of text.split("\n\n")) {
    const runs: RichTextRun[] = [];
    let at = 0;
    for (const m of para.matchAll(WRITTEN_VARIABLE)) {
      if (!offered.has(m[1])) continue;
      pushRun(runs, { text: para.slice(at, m.index) });
      runs.push({ var: m[1] });
      at = m.index + m[0].length;
    }
    pushRun(runs, { text: para.slice(at) });
    if (hasWords(runs)) out.push({ kind: "p", runs });
  }
  return out;
}
