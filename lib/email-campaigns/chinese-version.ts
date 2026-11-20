import {
  CHINESE,
  contentWords,
  EMAIL_BLOCK_LABEL,
  paragraphLinks,
  type CampaignContent,
  type ChineseBlockWords,
  type ChineseParagraph,
  type ChineseRun,
  type ChineseVersion,
  type EmailBlock,
  type Paragraph,
  type ParagraphOf,
  type Run,
} from "./content";
import { campaignVariable, fallbackWords, type VariableFallbacks, type VariableKey } from "./variables";

export { CHINESE };

export type ChineseStatus = "current" | "untranslated" | "changed";

export const CHINESE_STATUS_TEXT: Record<Exclude<ChineseStatus, "current">, string> = {
  untranslated: "Not translated yet",
  changed: "English changed since this was translated",
};

export const chineseVersionOf = (content: CampaignContent | null | undefined): ChineseVersion | null => content?.translations?.[CHINESE] ?? null;

export function blockLinkList(block: EmailBlock): string[] {
  return block.type === "text" || block.type === "split" ? paragraphLinks(block.paragraphs) : [];
}

function asChineseRuns(runs: readonly Run[], links: readonly string[]): ChineseRun[] {
  return runs.map((r): ChineseRun => {
    if ("var" in r) return { var: r.var };
    const link = r.href ? links.indexOf(r.href) : -1;
    return { text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(link >= 0 ? { link } : {}) };
  });
}

function mapParagraphs<A, B>(paragraphs: readonly ParagraphOf<A>[], runs: (rs: A[]) => B[]): ParagraphOf<B>[] {
  return paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) }));
}

export type BlockWords = ChineseBlockWords extends infer W ? (W extends ChineseBlockWords ? Omit<W, "from"> : never) : never;

const says = (im: { decorative?: boolean }) => !im.decorative;

const saved = (s: string) => s.trim();

export function englishWords(block: EmailBlock): BlockWords | null {
  switch (block.type) {
    case "heading":
      return { type: "heading", text: saved(block.text) };
    case "text":
      return { type: "text", paragraphs: mapParagraphs(block.paragraphs, (rs) => asChineseRuns(rs, blockLinkList(block))) as ChineseParagraph[] };
    case "buttons":
      return { type: "buttons", labels: block.buttons.map((x) => saved(x.label)) };
    case "image":
      return says(block.image) ? { type: "image", alt: saved(block.image.alt) } : null;
    case "hero": {
      const words = {
        ...(says(block.image) ? { alt: saved(block.image.alt) } : {}),
        ...(block.heading !== undefined ? { heading: saved(block.heading) } : {}),
        ...(block.line !== undefined ? { line: saved(block.line) } : {}),
        ...(block.button ? { buttonLabel: saved(block.button.label) } : {}),
      };
      return Object.keys(words).length ? { type: "hero", ...words } : null;
    }
    case "split":
      return {
        type: "split",
        alt: saved(block.image.alt),
        heading: saved(block.heading),
        paragraphs: mapParagraphs(block.paragraphs, (rs) => asChineseRuns(rs, blockLinkList(block))) as ChineseParagraph[],
        ...(block.button ? { buttonLabel: saved(block.button.label) } : {}),
      };
    case "products":
      return { type: "products", buttonLabel: saved(block.buttonLabel) };
    default:
      return null;
  }
}

function fingerprint(value: unknown): string {
  const s = JSON.stringify(value) ?? "";
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function unmarked(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unmarked);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => (k === "bold" || k === "italic" ? [] : [[k, unmarked(v)]])));
}

export const wordsFingerprint = (block: EmailBlock): string => fingerprint(unmarked(englishWords(block)));

export const linesFingerprint = (subject: string, preheader: string | null): string => fingerprint([subject.trim(), (preheader ?? "").trim()]);

function asRuns(runs: readonly ChineseRun[], links: readonly string[]): Run[] {
  return runs.map((r): Run => {
    if ("var" in r) return { var: r.var };
    const href = r.link === undefined ? undefined : links[r.link];
    return { text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(href ? { href } : {}) };
  });
}

const paragraphsIn = (english: EmailBlock & { paragraphs: Paragraph[] }, chinese: readonly ChineseParagraph[] | undefined): Paragraph[] =>
  mapParagraphs(chinese ?? [], (rs) => asRuns(rs, blockLinkList(english))) as Paragraph[];

export function chineseBlock(english: EmailBlock, words: ChineseBlockWords | undefined): EmailBlock {
  const w = words?.type === english.type ? words : undefined;
  switch (english.type) {
    case "heading":
      return { ...english, text: w?.type === "heading" ? w.text : "" };
    case "text":
      return { ...english, paragraphs: paragraphsIn(english, w?.type === "text" ? w.paragraphs : undefined) };
    case "buttons": {
      const labels = w?.type === "buttons" ? w.labels : [];
      return { ...english, buttons: english.buttons.map((x, i) => ({ ...x, label: labels[i] ?? "" })) };
    }
    case "image":
      return says(english.image) ? { ...english, image: { ...english.image, alt: w?.type === "image" ? (w.alt ?? "") : "" } } : english;
    case "hero": {
      const h = w?.type === "hero" ? w : undefined;
      return {
        ...english,
        image: says(english.image) ? { ...english.image, alt: h?.alt ?? "" } : english.image,
        ...(english.heading !== undefined ? { heading: h?.heading ?? "" } : {}),
        ...(english.line !== undefined ? { line: h?.line ?? "" } : {}),
        ...(english.button ? { button: { ...english.button, label: h?.buttonLabel ?? "" } } : {}),
      };
    }
    case "split": {
      const s = w?.type === "split" ? w : undefined;
      return {
        ...english,
        image: { ...english.image, alt: s?.alt ?? "" },
        heading: s?.heading ?? "",
        paragraphs: paragraphsIn(english, s?.paragraphs),
        ...(english.button ? { button: { ...english.button, label: s?.buttonLabel ?? "" } } : {}),
      };
    }
    case "products":
      return { ...english, buttonLabel: w?.type === "products" ? w.buttonLabel : "" };
    default:
      return english;
  }
}

export function chineseWordsOf(english: EmailBlock, edited: EmailBlock, from: string): ChineseBlockWords | null {
  const shape = englishWords(english);
  if (!shape || edited.type !== english.type) return null;
  switch (edited.type) {
    case "heading":
      return { type: "heading", from, text: edited.text };
    case "text":
      return { type: "text", from, paragraphs: mapParagraphs(edited.paragraphs, (rs) => asChineseRuns(rs, blockLinkList(english))) as ChineseParagraph[] };
    case "buttons": {
      const labels = english.type === "buttons" ? english.buttons.map((_, i) => edited.buttons[i]?.label ?? "") : [];
      return { type: "buttons", from, labels };
    }
    case "image":
      return { type: "image", from, alt: edited.image.alt };
    case "hero":
      return {
        type: "hero",
        from,
        ...("alt" in shape ? { alt: edited.image.alt } : {}),
        ...("heading" in shape ? { heading: edited.heading ?? "" } : {}),
        ...("line" in shape ? { line: edited.line ?? "" } : {}),
        ...("buttonLabel" in shape ? { buttonLabel: edited.button?.label ?? "" } : {}),
      };
    case "split":
      return {
        type: "split",
        from,
        alt: edited.image.alt,
        heading: edited.heading,
        paragraphs: mapParagraphs(edited.paragraphs, (rs) => asChineseRuns(rs, blockLinkList(english))) as ChineseParagraph[],
        ...("buttonLabel" in shape ? { buttonLabel: edited.button?.label ?? "" } : {}),
      };
    case "products":
      return { type: "products", from, buttonLabel: edited.buttonLabel };
    default:
      return null;
  }
}

const wordless = (b: EmailBlock) => contentWords({ v: 1, blocks: [b], fallbacks: {} }).every((w) => !w.trim());

export function chineseBlockStatus(english: EmailBlock, version: ChineseVersion | null): ChineseStatus | null {
  if (!englishWords(english)) return null;
  const words = version?.blocks[english.id];
  if (!words || words.type !== english.type) return "untranslated";
  return words.from === wordsFingerprint(english) ? "current" : "changed";
}

export function chineseLinesStatus(version: ChineseVersion | null, subject: string, preheader: string | null): ChineseStatus {
  if (!version || !version.subject.trim()) return "untranslated";
  return version.from === linesFingerprint(subject, preheader) ? "current" : "changed";
}

export interface ChineseGap {
  id: string;
  n: number;
  type: EmailBlock["type"];
  status: Exclude<ChineseStatus, "current">;
}

export function chineseGaps(content: CampaignContent): ChineseGap[] {
  const version = chineseVersionOf(content);
  return content.blocks.flatMap((b, i) => {
    const status = chineseBlockStatus(b, version);
    return status && status !== "current" ? [{ id: b.id, n: i + 1, type: b.type, status }] : [];
  });
}

export function chineseContent(content: CampaignContent): CampaignContent {
  const version = chineseVersionOf(content);
  if (!version) return content;
  return { v: content.v, blocks: content.blocks.map((b) => chineseBlock(b, version.blocks[b.id])), fallbacks: version.fallbacks };
}

export function chineseWords(content: CampaignContent | null): string[] {
  const version = chineseVersionOf(content);
  if (!content || !version) return [];
  return [version.subject, version.preheader, ...contentWords(chineseContent(content))];
}

function withVersion(content: CampaignContent, version: ChineseVersion | null): CampaignContent {
  const rest = { ...content };
  delete rest.translations;
  return version ? { ...rest, translations: { [CHINESE]: version } } : rest;
}

const EMPTY_VERSION: ChineseVersion = { subject: "", preheader: "", from: linesFingerprint("", null), fallbacks: {}, blocks: {} };

function withMarks(version: ChineseVersion, marked: readonly string[]): ChineseVersion {
  const rest = { ...version };
  delete rest.aiDrafted;
  return marked.length ? { ...rest, aiDrafted: [...new Set(marked)] } : rest;
}

export const chineseAiDrafted = (content: CampaignContent | null | undefined): string[] => chineseVersionOf(content)?.aiDrafted ?? [];

export function keepChineseAiDrafted(content: CampaignContent, ids?: readonly string[]): CampaignContent {
  const version = chineseVersionOf(content);
  if (!version) return content;
  const kept = ids ? new Set(ids) : null;
  return withVersion(content, withMarks(version, (version.aiDrafted ?? []).filter((id) => kept && !kept.has(id))));
}

export function withChineseBlocks(content: CampaignContent, edited: readonly EmailBlock[]): CampaignContent {
  const version = chineseVersionOf(content) ?? EMPTY_VERSION;
  const blocks = { ...version.blocks };
  const changed = new Set<string>();
  for (const english of content.blocks) {
    const now = edited.find((b) => b.id === english.id);
    const had = blocks[english.id];
    if (!now || JSON.stringify(now) === JSON.stringify(chineseBlock(english, had))) continue;
    changed.add(english.id);
    const words = chineseWordsOf(english, now, had?.type === english.type ? had.from : wordsFingerprint(english));
    if (!words || wordless(now)) delete blocks[english.id];
    else blocks[english.id] = words;
  }
  return withVersion(content, withMarks({ ...version, blocks }, (version.aiDrafted ?? []).filter((id) => !changed.has(id))));
}

export function withChineseLines(
  content: CampaignContent,
  patch: Partial<Pick<ChineseVersion, "subject" | "preheader" | "fallbacks">>,
  english?: { subject: string; preheader: string | null },
): CampaignContent {
  const version = chineseVersionOf(content) ?? EMPTY_VERSION;
  const fresh = english && !version.subject.trim() && patch.subject?.trim();
  return withVersion(content, { ...version, ...patch, ...(fresh ? { from: linesFingerprint(english.subject, english.preheader) } : {}) });
}

export function keepChineseBlock(content: CampaignContent, blockId: string): CampaignContent {
  const version = chineseVersionOf(content);
  const english = content.blocks.find((b) => b.id === blockId);
  const had = version?.blocks[blockId];
  if (!version || !english || !had) return content;
  const words = chineseWordsOf(english, chineseBlock(english, had), wordsFingerprint(english));
  return words ? keepChineseAiDrafted(withVersion(content, { ...version, blocks: { ...version.blocks, [blockId]: words } }), [blockId]) : content;
}

export function keepChineseLines(content: CampaignContent, subject: string, preheader: string | null): CampaignContent {
  const version = chineseVersionOf(content);
  return version ? withVersion(content, { ...version, from: linesFingerprint(subject, preheader) }) : content;
}

export interface ChineseTranslation {
  subject?: string;
  preheader?: string;
  from?: string;
  fallbacks?: VariableFallbacks;
  blocks: Record<string, ChineseBlockWords>;
}

export function withChineseTranslation(content: CampaignContent, t: ChineseTranslation): CampaignContent {
  const version = chineseVersionOf(content) ?? EMPTY_VERSION;
  const present = new Set(content.blocks.map((b) => b.id));
  const blocks = Object.fromEntries(Object.entries({ ...version.blocks, ...t.blocks }).filter(([id]) => present.has(id)));
  const next: ChineseVersion = {
    ...version,
    ...(t.subject !== undefined ? { subject: t.subject } : {}),
    ...(t.preheader !== undefined ? { preheader: t.preheader } : {}),
    ...(t.from !== undefined ? { from: t.from } : {}),
    fallbacks: { ...version.fallbacks, ...t.fallbacks },
    blocks,
  };
  return withVersion(content, withMarks(next, [...(version.aiDrafted ?? []), ...Object.keys(t.blocks)].filter((id) => present.has(id))));
}

export const withoutChineseVersion = (content: CampaignContent): CampaignContent => withVersion(content, null);

export function withoutGoneChinese(content: CampaignContent): CampaignContent {
  const version = chineseVersionOf(content);
  if (!version) return content;
  const types = new Map(content.blocks.map((b) => [b.id, b.type]));
  const kept = Object.entries(version.blocks).filter(([id, w]) => types.get(id) === w.type);
  const marks = (version.aiDrafted ?? []).filter((id) => types.has(id));
  if (kept.length === Object.keys(version.blocks).length && marks.length === (version.aiDrafted ?? []).length) return content;
  return withVersion(content, withMarks({ ...version, blocks: Object.fromEntries(kept) }, marks));
}

export function chineseVersionProblems(
  content: CampaignContent | null,
  { subject, preheader, used }: { subject: string; preheader: string | null; used: readonly VariableKey[] },
): string[] {
  const version = chineseVersionOf(content);
  if (!content || !version) return [];
  const out: string[] = [];
  const lines = chineseLinesStatus(version, subject, preheader);
  if (lines === "untranslated") out.push("the subject is not translated yet");
  if (lines === "changed") out.push("the subject or preview line changed in English since it was translated");
  for (const gap of chineseGaps(content)) out.push(`Block ${gap.n}, ${EMAIL_BLOCK_LABEL[gap.type]}: ${CHINESE_STATUS_TEXT[gap.status].toLowerCase()}`);
  for (const key of used) {
    if (!fallbackWords(key, version.fallbacks, { chinese: true })) out.push(`no 中文 words for a customer with no ${campaignVariable(key).label.toLowerCase()}`);
  }
  return out;
}

export const CHINESE_EDITOR_TEXT = {
  language: "Language",
  english: "English",
  chinese: "中文",
  translate: "Translate to Chinese",
  translating: "Translating to Chinese…",
  changed: "Translate what changed",
  again: "Translate everything again",
  block: "Translate",
  blockAgain: "Translate again",
  keep: "Keep",
  remove: "Remove the 中文 version",
  removed: "Removed the 中文 version: everyone gets English.",
  layout: "The layout is shared with English. Change it there.",
  needsWords: "Write the email in English first, then Claude can translate it.",
} as const;

function englishField(type: EmailBlock["type"], field: string): string {
  if (field === "alt" && (type === "image" || type === "hero" || type === "split")) return "image.alt";
  if (field === "buttonLabel" && (type === "hero" || type === "split")) return "button.label";
  const label = /^labels\.(\d+)$/.exec(field);
  if (label && type === "buttons") return `buttons.${label[1]}.label`;
  return field;
}

const CHINESE_ERRORS = `content.translations.${CHINESE}.`;

export const hasChineseErrors = (errors: Record<string, string>) => Object.keys(errors).some((k) => k.startsWith(CHINESE_ERRORS));

export function chineseFieldErrors(errors: Record<string, string>, content: CampaignContent): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    if (!key.startsWith(CHINESE_ERRORS)) continue;
    const rest = key.slice(CHINESE_ERRORS.length);
    if (rest === "subject" || rest === "preheader") out[rest] ??= message;
    const m = /^blocks\.([^.]+)(?:\.(.+))?$/.exec(rest);
    const i = m ? content.blocks.findIndex((b) => b.id === m[1]) : -1;
    if (m && i !== -1) out[`content.blocks.${i}.${englishField(content.blocks[i].type, m[2] ?? "text")}`] ??= message;
  }
  return out;
}
