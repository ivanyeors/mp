/**
 * A campaign's 中文 version (PRD-campaign-email-editor slice 17, decision 11):
 * the same email with its words in Simplified Chinese, for the Customers
 * whose `locale` is `zh-CN`. Pure, and safe in the browser.
 *
 * It lives in `content.translations["zh-CN"]` (content.ts), so the schema,
 * the size check and the lock cover it. Only words are kept there, each
 * block's by its id (`ChineseBlockWords`): everything else, the order, the
 * images, products, button targets, links and options, is the English
 * block's, read through at render (`chineseBlock`). Changing the layout in
 * English changes the 中文 email's; changing a word in English leaves its
 * block out of date in 中文 (`wordsFingerprint`), until it is translated
 * again or kept.
 *
 * The editor shows the 中文 blocks as ordinary blocks with their words
 * swapped in, and reads an edit back as words alone (`chineseWordsOf`), so a
 * 中文 edit can never move or restyle anything.
 */
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

/** How a block's 中文 words stand against its English. */
export type ChineseStatus = "current" | "untranslated" | "changed";

/** What a block's card says in 中文 when its words aren't current. */
export const CHINESE_STATUS_TEXT: Record<Exclude<ChineseStatus, "current">, string> = {
  untranslated: "Not translated yet",
  changed: "English changed since this was translated",
};

/** Pure — the campaign's 中文 version, or null when it has none (a legacy campaign never does). */
export const chineseVersionOf = (content: CampaignContent | null | undefined): ChineseVersion | null => content?.translations?.[CHINESE] ?? null;

/** Pure — each address a block links to, once, in order: what a 中文 run's `link` counts from. */
export function blockLinkList(block: EmailBlock): string[] {
  return block.type === "text" || block.type === "split" ? paragraphLinks(block.paragraphs) : [];
}

// ---------------------------------------------------------------------------
// The English words, and their fingerprint
// ---------------------------------------------------------------------------

/** English runs as a 中文 block holds runs: a link by its place among the block's links. */
function asChineseRuns(runs: readonly Run[], links: readonly string[]): ChineseRun[] {
  return runs.map((r): ChineseRun => {
    if ("var" in r) return { var: r.var };
    const link = r.href ? links.indexOf(r.href) : -1;
    return { text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(link >= 0 ? { link } : {}) };
  });
}

/** Paragraphs of one kind of run, mapped run list by run list. */
function mapParagraphs<A, B>(paragraphs: readonly ParagraphOf<A>[], runs: (rs: A[]) => B[]): ParagraphOf<B>[] {
  return paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) }));
}

/** A block's words in the 中文 shape, without their fingerprint: each type's own. */
export type BlockWords = ChineseBlockWords extends infer W ? (W extends ChineseBlockWords ? Omit<W, "from"> : never) : never;

/** An image says something: it has alt text to translate, unless it is decorative. */
const says = (im: { decorative?: boolean }) => !im.decorative;

/**
 * A one-line field as Save keeps it, trimmed (content.ts `wordsSchemas`): the
 * editor holds it as typed, the translate route and the send checks as
 * saved, and all three must read the same words. A text block's runs are
 * kept as typed, so they are read as they are.
 */
const saved = (s: string) => s.trim();

/**
 * Pure — the words of an English block in the shape a 中文 block keeps them,
 * without their fingerprint: what ✨ Translate reads and what a 中文 block
 * must match. Null for a block with nothing to translate: a divider, a
 * spacer, a decorative image.
 */
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

/** A short, stable hash of some JSON (cyrb53): equal words, equal fingerprints. */
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

/** The words as a fingerprint reads them: bold and italic aside, which say nothing new to translate. */
function unmarked(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(unmarked);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).flatMap(([k, v]) => (k === "bold" || k === "italic" ? [] : [[k, unmarked(v)]])));
}

/**
 * Pure — the fingerprint of an English block's words: their text, its
 * Variables and where its links sit, never a link's address or a mark. A
 * 中文 block made from these words keeps it as `from`; the English changing
 * since changes it, and the block reads *English changed since this was
 * translated*.
 */
export const wordsFingerprint = (block: EmailBlock): string => fingerprint(unmarked(englishWords(block)));

/** Pure — the fingerprint of the English subject and preview line the 中文 ones were made from. */
export const linesFingerprint = (subject: string, preheader: string | null): string => fingerprint([subject.trim(), (preheader ?? "").trim()]);

// ---------------------------------------------------------------------------
// The 中文 block: English layout, 中文 words
// ---------------------------------------------------------------------------

/** 中文 runs as a block holds them: each link its English address; a link the English no longer has is words alone. */
function asRuns(runs: readonly ChineseRun[], links: readonly string[]): Run[] {
  return runs.map((r): Run => {
    if ("var" in r) return { var: r.var };
    const href = r.link === undefined ? undefined : links[r.link];
    return { text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(href ? { href } : {}) };
  });
}

const paragraphsIn = (english: EmailBlock & { paragraphs: Paragraph[] }, chinese: readonly ChineseParagraph[] | undefined): Paragraph[] =>
  mapParagraphs(chinese ?? [], (rs) => asRuns(rs, blockLinkList(english))) as Paragraph[];

/**
 * Pure — the block as the 中文 email has it: the English block, its words
 * swapped for `words`. A word `words` leaves out (none at all, for a block
 * not translated yet) reads as empty, on its placeholder in the editor.
 */
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

/**
 * Pure — a 中文 block's words read back from the block as the editor changed
 * it, with the fingerprint `from`: its words alone, in the English block's
 * shape. A link is kept only where it is one of the English block's.
 */
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

/** Pure — a block shows no words at all: as good as not translated. */
const wordless = (b: EmailBlock) => contentWords({ v: 1, blocks: [b], fallbacks: {} }).every((w) => !w.trim());

/** Pure — where a block's 中文 words stand: current, not translated yet, or made from English that has changed since. Null for a block with no words. */
export function chineseBlockStatus(english: EmailBlock, version: ChineseVersion | null): ChineseStatus | null {
  if (!englishWords(english)) return null;
  const words = version?.blocks[english.id];
  if (!words || words.type !== english.type) return "untranslated";
  return words.from === wordsFingerprint(english) ? "current" : "changed";
}

/** Pure — where the 中文 subject and preview line stand against the English ones. */
export function chineseLinesStatus(version: ChineseVersion | null, subject: string, preheader: string | null): ChineseStatus {
  if (!version || !version.subject.trim()) return "untranslated";
  return version.from === linesFingerprint(subject, preheader) ? "current" : "changed";
}

/** One block whose 中文 words aren't current, as the editor and the checks name it. */
export interface ChineseGap {
  id: string;
  /** Its place in the email, from 1. */
  n: number;
  type: EmailBlock["type"];
  status: Exclude<ChineseStatus, "current">;
}

/** Pure — every block whose 中文 words aren't current, in order. */
export function chineseGaps(content: CampaignContent): ChineseGap[] {
  const version = chineseVersionOf(content);
  return content.blocks.flatMap((b, i) => {
    const status = chineseBlockStatus(b, version);
    return status && status !== "current" ? [{ id: b.id, n: i + 1, type: b.type, status }] : [];
  });
}

/**
 * Pure — the content as the 中文 email reads: each English block with its
 * 中文 words, and the 中文 fallbacks. What the renderer draws for a `zh-CN`
 * reader, and what slice 11's content checks read for the 中文 version.
 * The English content itself when there is no 中文 version.
 */
export function chineseContent(content: CampaignContent): CampaignContent {
  const version = chineseVersionOf(content);
  if (!version) return content;
  return { v: content.v, blocks: content.blocks.map((b) => chineseBlock(b, version.blocks[b.id])), fallbacks: version.fallbacks };
}

/** Pure — every word a 中文 reader reads in the blocks, the subject and the preview line: what the points rule and the Variables read. */
export function chineseWords(content: CampaignContent | null): string[] {
  const version = chineseVersionOf(content);
  if (!content || !version) return [];
  return [version.subject, version.preheader, ...contentWords(chineseContent(content))];
}

// ---------------------------------------------------------------------------
// Changes to the 中文 version, each one step of the editor's history
// ---------------------------------------------------------------------------

/** The content with `version` as its 中文 version; none at all for null. */
function withVersion(content: CampaignContent, version: ChineseVersion | null): CampaignContent {
  const rest = { ...content };
  delete rest.translations;
  return version ? { ...rest, translations: { [CHINESE]: version } } : rest;
}

/** A 中文 version with nothing in it yet. */
const EMPTY_VERSION: ChineseVersion = { subject: "", preheader: "", from: linesFingerprint("", null), fallbacks: {}, blocks: {} };

/** The version with exactly `marked` marked *Drafted with AI*: no `aiDrafted` at all when none is. */
function withMarks(version: ChineseVersion, marked: readonly string[]): ChineseVersion {
  const rest = { ...version };
  delete rest.aiDrafted;
  return marked.length ? { ...rest, aiDrafted: [...new Set(marked)] } : rest;
}

/**
 * Pure — the blocks whose 中文 words Claude wrote and no person has edited or
 * kept since (PRD decision 9): shown *Drafted with AI* in 中文, and counted
 * by the send checks as advice, as the English blocks' marks are.
 */
export const chineseAiDrafted = (content: CampaignContent | null | undefined): string[] => chineseVersionOf(content)?.aiDrafted ?? [];

/** Pure — the 中文 words of `ids` (every block's, when none are named) kept as Claude wrote them: no longer marked. */
export function keepChineseAiDrafted(content: CampaignContent, ids?: readonly string[]): CampaignContent {
  const version = chineseVersionOf(content);
  if (!version) return content;
  const kept = ids ? new Set(ids) : null;
  return withVersion(content, withMarks(version, (version.aiDrafted ?? []).filter((id) => kept && !kept.has(id))));
}

/**
 * Pure — the content after an edit to the 中文 blocks in the editor
 * (`edited` is the 中文 blocks, in the English order): each block whose words
 * changed keeps its new words, read back as words alone, with the
 * fingerprint it had (or the English's, for a block translated by hand just
 * now). A block left with no words at all is not translated.
 */
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
  // A block a person changes in 中文 is no longer *Drafted with AI*.
  return withVersion(content, withMarks({ ...version, blocks }, (version.aiDrafted ?? []).filter((id) => !changed.has(id))));
}

/**
 * Pure — the content with the 中文 subject, preview line or fallbacks changed,
 * by hand. A subject written where there was none is a translation of the
 * English lines now (`english`), so they are what it is current against.
 */
export function withChineseLines(
  content: CampaignContent,
  patch: Partial<Pick<ChineseVersion, "subject" | "preheader" | "fallbacks">>,
  english?: { subject: string; preheader: string | null },
): CampaignContent {
  const version = chineseVersionOf(content) ?? EMPTY_VERSION;
  const fresh = english && !version.subject.trim() && patch.subject?.trim();
  return withVersion(content, { ...version, ...patch, ...(fresh ? { from: linesFingerprint(english.subject, english.preheader) } : {}) });
}

/**
 * Pure — *Keep*: the block's 中文 words as they are, made current against the
 * English now (its words in the English block's shape, a part the English has
 * gained empty for Staff to write), and no longer *Drafted with AI*: a
 * person has kept them.
 */
export function keepChineseBlock(content: CampaignContent, blockId: string): CampaignContent {
  const version = chineseVersionOf(content);
  const english = content.blocks.find((b) => b.id === blockId);
  const had = version?.blocks[blockId];
  if (!version || !english || !had) return content;
  const words = chineseWordsOf(english, chineseBlock(english, had), wordsFingerprint(english));
  return words ? keepChineseAiDrafted(withVersion(content, { ...version, blocks: { ...version.blocks, [blockId]: words } }), [blockId]) : content;
}

/** Pure — *Keep* for the subject and preview line: current against the English ones now. */
export function keepChineseLines(content: CampaignContent, subject: string, preheader: string | null): CampaignContent {
  const version = chineseVersionOf(content);
  return version ? withVersion(content, { ...version, from: linesFingerprint(subject, preheader) }) : content;
}

/** What ✨ Translate brings back (slice 17): any of the lines, the fallbacks, and blocks' words, each with its fingerprint. */
export interface ChineseTranslation {
  subject?: string;
  preheader?: string;
  /** The English lines' fingerprint, with the subject and preview line. */
  from?: string;
  fallbacks?: VariableFallbacks;
  blocks: Record<string, ChineseBlockWords>;
}

/**
 * Pure — the content with a translation put in: the 中文 version made, or
 * what it brings replacing what was there. Claude wrote its blocks' words,
 * so each is marked *Drafted with AI* until a person edits or keeps it.
 */
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

/** Pure — *Remove the 中文 version*: English to everyone again. */
export const withoutChineseVersion = (content: CampaignContent): CampaignContent => withVersion(content, null);

/**
 * Pure — the 中文 words and marks of blocks no longer in the email dropped:
 * after a delete in English. Nothing changes (the same object) when none are
 * gone.
 */
export function withoutGoneChinese(content: CampaignContent): CampaignContent {
  const version = chineseVersionOf(content);
  if (!version) return content;
  const types = new Map(content.blocks.map((b) => [b.id, b.type]));
  const kept = Object.entries(version.blocks).filter(([id, w]) => types.get(id) === w.type);
  const marks = (version.aiDrafted ?? []).filter((id) => types.has(id));
  if (kept.length === Object.keys(version.blocks).length && marks.length === (version.aiDrafted ?? []).length) return content;
  return withVersion(content, withMarks({ ...version, blocks: Object.fromEntries(kept) }, marks));
}

// ---------------------------------------------------------------------------
// Ready to send?
// ---------------------------------------------------------------------------

/**
 * Pure — what keeps the 中文 version from going out, by block, in words for
 * Staff: a block not translated yet or out of date (not kept), the subject
 * the same, and a Variable without 中文 fallback words (`used`, the email's
 * Variables). None when it is complete, or when there is no 中文 version.
 * Before each wave the send checks run it (sender.ts `chineseCheck`): a reader
 * of Chinese never gets a half-English email.
 */
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

// ---------------------------------------------------------------------------
// The editor's words, and Save's errors in 中文
// ---------------------------------------------------------------------------

/** The campaign editor's words for the 中文 version (slice 17). */
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

/** A 中文 block's field, as the English block's form names it in an error: `labels.1` is `buttons.1.label`. */
function englishField(type: EmailBlock["type"], field: string): string {
  if (field === "alt" && (type === "image" || type === "hero" || type === "split")) return "image.alt";
  if (field === "buttonLabel" && (type === "hero" || type === "split")) return "button.label";
  const label = /^labels\.(\d+)$/.exec(field);
  if (label && type === "buttons") return `buttons.${label[1]}.label`;
  return field;
}

const CHINESE_ERRORS = `content.translations.${CHINESE}.`;

/** Pure — Save refused something in the 中文 version: the editor opens it in 中文. */
export const hasChineseErrors = (errors: Record<string, string>) => Object.keys(errors).some((k) => k.startsWith(CHINESE_ERRORS));

/**
 * Pure — Save's errors as the editor shows them in 中文: a 中文 block's
 * (`content.translations.zh-CN.blocks.<id>.<field>`) on its card, as an
 * English block's would be (`content.blocks.<index>.<field>`), and the 中文
 * subject's and preview line's on their fields. The fallbacks keep their own.
 */
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
