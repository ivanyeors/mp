/**
 * ✨ Translate's shapes (PRD-campaign-email-editor slice 17): what the editor
 * asks for, what Claude reads and fills in, and how its answer comes back as
 * the 中文 version's words, checked. Pure, and safe in the browser.
 *
 * Claude reads only words: each block's, in the shape a 中文 block keeps them
 * (chinese-version.ts `englishWords`), by its id. A link is a key (`L1`,
 * `L2`) and never an address; a Variable is its name. The answer gives the
 * same blocks back, by id, in Chinese. Code then puts each key back as the
 * block's link, and refuses a translation that loses or adds a block, a
 * link or a Variable, moves the links out of order, breaks a length, or says
 * what the guardrails don't allow in Chinese, naming the block.
 */
import { z } from "zod";
import { placeholdersIn } from "@/lib/email/copy";
import { issueText } from "./ai-draft-shape";
import { chineseWordsProblems } from "./ai-guardrails";
import { linkKey } from "./ai-refine-shape";
import { blockLinkList, CHINESE_EDITOR_TEXT, chineseVersionOf, englishWords, linesFingerprint, wordsFingerprint, type BlockWords, type ChineseTranslation } from "./chinese-version";
import {
  CampaignContentPreviewSchema,
  ChineseBlockWordsSchema,
  CONTENT_LIMITS,
  contentWords,
  EMAIL_BLOCK_NAME,
  paragraphRuns,
  variablesUsed,
  type CampaignContent,
  type ChineseBlockWords,
  type ChineseParagraph,
  type ChineseRun,
  type EmailBlock,
} from "./content";
import { campaignVariable, fallbackWords, isVariableKey, VARIABLE_MAX, type VariableKey } from "./variables";

const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BLOCK_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * What the editor sends: the email as it holds it now (Staff's words, never
 * a customer's), which blocks to translate (`only`; null for every block with
 * words, the whole 中文 version), and whether the subject and preview line
 * go too. A campaign that has started sending is refused by the route.
 */
export const TranslateRequestSchema = z.strictObject({
  campaignId: z.string().regex(CAMPAIGN_ID).nullable(),
  subject: z.string().max(CONTENT_LIMITS.subject),
  preheader: z.string().max(CONTENT_LIMITS.preheader),
  content: CampaignContentPreviewSchema,
  only: z.array(z.string().regex(BLOCK_ID)).max(CONTENT_LIMITS.blocks).nullable(),
  lines: z.boolean(),
});
export type TranslateRequest = z.output<typeof TranslateRequestSchema>;

/** A block in Claude's hands: its words, in the 中文 shape, with its id. */
type SourceBlock = BlockWords & { id: string };

/** A block's words have some words in them: an empty English block has nothing to translate yet. */
const hasWords = (b: EmailBlock) => contentWords({ v: 1, blocks: [b], fallbacks: {} }).some((w) => w.trim());

/** Pure — the blocks `request` asks to translate, in the email's order: those with words, all or the ones named. */
export function blocksToTranslate(request: Pick<TranslateRequest, "content" | "only">): EmailBlock[] {
  const only = request.only ? new Set(request.only) : null;
  return request.content.blocks.filter((b) => englishWords(b) && hasWords(b) && (!only || only.has(b.id)));
}

/**
 * Pure — the Variables whose fallback words go with the translation: used in
 * the email, with English fallback words of their own and no 中文 default to
 * fall back on (*您* is a first name's). Every such one for the whole 中文
 * version; for part of it, those it has none for yet.
 */
export function fallbacksToTranslate(request: Pick<TranslateRequest, "content" | "only" | "subject" | "preheader">): VariableKey[] {
  const chinese = chineseVersionOf(request.content)?.fallbacks ?? {};
  return variablesUsed(request.content, [request.subject, request.preheader]).filter(
    (key) =>
      campaignVariable(key).chineseFallback === null &&
      fallbackWords(key, request.content.fallbacks) !== null &&
      (request.only === null || !fallbackWords(key, chinese, { chinese: true })),
  );
}

/** Pure — why ✨ Translate can't run for `request`, or null: it has nothing in English to translate. */
export function translateBlocker(request: Pick<TranslateRequest, "content" | "only" | "lines" | "subject">): string | null {
  if (blocksToTranslate(request).length || (request.lines && request.subject.trim())) return null;
  return TRANSLATE_NEEDS_WORDS;
}

export const TRANSLATE_NEEDS_WORDS = CHINESE_EDITOR_TEXT.needsWords;

/** A block's place and name, as a reason names it: *Block 2, Text*. */
export const blockLabel = (content: CampaignContent, block: EmailBlock) => `Block ${content.blocks.indexOf(block) + 1}, ${EMAIL_BLOCK_NAME[block.type]}`;

/** English runs as Claude reads them: a link by its key. */
const sourceParagraphs = (paragraphs: readonly ChineseParagraph[]) =>
  paragraphs.map((p) => {
    const runs = (rs: ChineseRun[]) => rs.map((r) => ("var" in r || r.link === undefined ? r : { ...r, link: linkKey(r.link) }));
    return p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) };
  });

/** Pure — what Claude reads: the blocks' words with their ids, the subject and preview line, and the fallbacks, as data. */
export function translateSource(request: TranslateRequest): unknown {
  const blocks = blocksToTranslate(request).map((b) => {
    const words = englishWords(b) as BlockWords;
    return { id: b.id, ...words, ...("paragraphs" in words ? { paragraphs: sourceParagraphs(words.paragraphs) } : {}) } as SourceBlock;
  });
  const fallbacks = fallbacksToTranslate(request);
  return {
    ...(request.lines ? { subject: request.subject.trim(), previewLine: request.preheader.trim() } : {}),
    blocks,
    ...(fallbacks.length
      ? { fallbacks: Object.fromEntries(fallbacks.map((k) => [k, { standsInFor: campaignVariable(k).label.toLowerCase(), words: fallbackWords(k, request.content.fallbacks) }])) }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Claude's answer
// ---------------------------------------------------------------------------

/** The Variables any of the asked blocks' text runs hold: what a 中文 run may name. */
function runVariables(blocks: readonly EmailBlock[]): VariableKey[] {
  const keys = blocks.flatMap((b) => {
    const words = englishWords(b);
    return words && "paragraphs" in words ? paragraphRuns(words.paragraphs).flatMap((r) => ("var" in r ? [r.var] : [])) : [];
  });
  return [...new Set(keys)];
}

const line = (what: string) => z.string().describe(what);

/**
 * Pure — the schema of Claude's answer to `request`, flat and built per
 * request: one shape per block type asked, then the subject and preview
 * line, and the fallbacks, when they go. Strict objects; the SDK's JSON
 * schema leaves enums to the descriptions, so the parse that follows, not the
 * grammar, holds the ids, the types and the link keys.
 */
export function translateOutputSchema(request: TranslateRequest) {
  const asked = blocksToTranslate(request);
  const vars = runVariables(asked);
  const words = z.strictObject({
    text: line("Chinese words. A line break is \\n. No markdown, no HTML, no links."),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    link: z.string().optional().describe("The key of one of this block's links, L1 or L2, on the words it links."),
  });
  const run = vars.length ? z.union([words, z.strictObject({ var: z.enum(vars as [VariableKey, ...VariableKey[]]) })]) : words;
  const runs = z.array(run).describe("The words of one paragraph or bullet, in runs.");
  const paragraphs = z
    .array(z.union([z.strictObject({ kind: z.literal("p"), runs }), z.strictObject({ kind: z.literal("bullets"), items: z.array(runs).describe("Each bullet's runs.") })]))
    .describe("The block's paragraphs and bullet lists, in Chinese, in the English's shape.");
  const id = z.string().describe("The block's id, as given.");
  const label = line("A button's label in Chinese, short: at most 40 characters.");
  const alt = line("The image's alt text in Chinese: what a screen reader says.");
  const heading = line("A heading in Chinese, one line of at most 120 characters, its Variables written as the English writes them, such as {first_name}.");
  const byType: Record<string, z.ZodType> = {
    heading: z.strictObject({ id, type: z.literal("heading"), text: heading }),
    text: z.strictObject({ id, type: z.literal("text"), paragraphs }),
    buttons: z.strictObject({ id, type: z.literal("buttons"), labels: z.array(label).describe("Each button's label, in the English's order.") }),
    image: z.strictObject({ id, type: z.literal("image"), alt }),
    hero: z.strictObject({ id, type: z.literal("hero"), alt: alt.optional(), heading: heading.optional(), line: line("The line under the heading, in Chinese.").optional(), buttonLabel: label.optional() }),
    split: z.strictObject({ id, type: z.literal("split"), alt, heading, paragraphs, buttonLabel: label.optional() }),
    products: z.strictObject({ id, type: z.literal("products"), buttonLabel: label }),
  };
  const types = [...new Set(asked.map((b) => b.type))].filter((t) => byType[t]);
  const block = types.length > 1 ? z.union(types.map((t) => byType[t]) as [z.ZodType, z.ZodType, ...z.ZodType[]]) : (byType[types[0] ?? "heading"] as z.ZodType);
  const fallbacks = fallbacksToTranslate(request);
  return z.strictObject({
    ...(request.lines
      ? {
          subject: line("The subject in Chinese, short, its Variables written as the English writes them."),
          previewLine: line("The preview line in Chinese, or empty when the English has none."),
        }
      : {}),
    blocks: z.array(block).describe("Every block given, once each, with its id and type, in Chinese."),
    ...(fallbacks.length
      ? { fallbacks: z.strictObject(Object.fromEntries(fallbacks.map((k) => [k, line(`Chinese words that stand in for a customer's missing ${campaignVariable(k).label.toLowerCase()}.`)]))) }
      : {}),
  });
}

/** A link group: consecutive runs on one link, as the renderer draws one <a>. */
function linkSequence(paragraphs: readonly ChineseParagraph[]): number[] {
  const out: number[] = [];
  for (const p of paragraphs) {
    for (const rs of p.kind === "p" ? [p.runs] : p.items) {
      let last: number | undefined;
      for (const r of rs) {
        const link = "var" in r ? undefined : r.link;
        if (link !== undefined && link !== last) out.push(link);
        last = link;
      }
    }
  }
  return out;
}

/** The Variables some words name, as runs or written `{name}`. */
function wordsVariables(words: BlockWords): VariableKey[] {
  const strings: string[] = [];
  const keys: VariableKey[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if ("var" in v && typeof v.var === "string" && isVariableKey(v.var)) keys.push(v.var);
      else Object.entries(v).forEach(([k, x]) => k !== "type" && walk(x));
    }
  };
  walk(words);
  return [...new Set([...keys, ...strings.flatMap((s) => placeholdersIn(s).filter(isVariableKey))])];
}

/** Every word a block's words hold, a Variable as `{name}`, a line each: what the guardrails read. */
function wordsText(words: BlockWords): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      if ("var" in v && typeof v.var === "string") out.push(`{${v.var}}`);
      else Object.entries(v).forEach(([k, x]) => k !== "type" && k !== "kind" && k !== "link" && walk(x));
    }
  };
  walk(words);
  return out.join("\n");
}

type AnswerRun = { text: string; bold?: boolean; italic?: boolean; link?: string } | { var: VariableKey };
type AnswerParagraph = { kind: "p"; runs: AnswerRun[] } | { kind: "bullets"; items: AnswerRun[][] };

const squashed = (s: string | undefined) => (s === undefined ? undefined : s.replace(/\s+/g, " ").trim());

/** One answered block as a 中文 block's words, its link keys as places among the English links; or why not. */
function wordsFromAnswer(english: EmailBlock, raw: Record<string, unknown>, links: number): { ok: true; words: BlockWords } | { ok: false; problem: string } {
  let bad: string | null = null;
  const runs = (rs: AnswerRun[]): ChineseRun[] =>
    rs.flatMap((r): ChineseRun[] => {
      if ("var" in r) return [{ var: r.var }];
      if (!r.text) return [];
      const at = r.link === undefined ? undefined : Number(/^L(\d+)$/.exec(r.link)?.[1] ?? NaN) - 1;
      if (at !== undefined && !(at >= 0 && at < links)) bad = `uses the link key "${r.link}", which the block doesn't have`;
      return [{ text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(at !== undefined && at >= 0 && at < links ? { link: at } : {}) }];
    });
  const paragraphs = (ps: AnswerParagraph[]): ChineseParagraph[] =>
    ps.flatMap((p): ChineseParagraph[] => {
      if (p.kind === "p") {
        const r = runs(p.runs);
        return r.length ? [{ kind: "p", runs: r }] : [];
      }
      const items = p.items.map(runs).filter((r) => r.length);
      return items.length ? [{ kind: "bullets", items }] : [];
    });
  const shape = englishWords(english) as BlockWords;
  const has = (k: string) => k in shape;
  const part = (k: string) => (has(k) ? (squashed(raw[k] as string | undefined) ?? "") : undefined);
  const words = ((): BlockWords => {
    switch (english.type) {
      case "heading":
        return { type: "heading", text: squashed(raw.text as string) ?? "" };
      case "text":
        return { type: "text", paragraphs: paragraphs(raw.paragraphs as AnswerParagraph[]) };
      case "buttons":
        return { type: "buttons", labels: (raw.labels as string[]).map((l) => squashed(l) ?? "") };
      case "image":
        return { type: "image", alt: squashed(raw.alt as string) ?? "" };
      case "hero": {
        const out: Record<string, string> = {};
        for (const k of ["alt", "heading", "line", "buttonLabel"]) {
          if (has(k)) out[k] = part(k) ?? "";
          else if (raw[k] !== undefined) bad = `adds a ${k === "buttonLabel" ? "button" : k} the English doesn't have`;
        }
        return { type: "hero", ...out };
      }
      case "split":
        if (!has("buttonLabel") && raw.buttonLabel !== undefined) bad = "adds a button the English doesn't have";
        return {
          type: "split",
          alt: squashed(raw.alt as string) ?? "",
          heading: squashed(raw.heading as string) ?? "",
          paragraphs: paragraphs(raw.paragraphs as AnswerParagraph[]),
          ...(has("buttonLabel") ? { buttonLabel: part("buttonLabel") ?? "" } : {}),
        };
      default:
        return { type: "products", buttonLabel: squashed(raw.buttonLabel as string) ?? "" };
    }
  })();
  if (shape.type === "buttons" && words.type === "buttons" && words.labels.length !== shape.labels.length) {
    return { ok: false, problem: `has ${words.labels.length} button labels for ${shape.labels.length} buttons` };
  }
  return bad ? { ok: false, problem: bad } : { ok: true, words };
}

/** Pure — what is wrong with one block's 中文 words against its English: its shape, its lengths, its links, its Variables, and the guardrails. */
export function translatedBlockProblems(english: EmailBlock, words: BlockWords, source: string): string[] {
  const out: string[] = [];
  const saved = ChineseBlockWordsSchema.safeParse({ ...words, from: wordsFingerprint(english) });
  if (!saved.success) out.push(issueText(saved.error));
  const shape = englishWords(english) as BlockWords;
  if ("paragraphs" in shape && "paragraphs" in words) {
    const before = linkSequence(shape.paragraphs);
    const after = linkSequence(words.paragraphs);
    if (after.length < before.length) out.push(`drops a link: the English has ${before.length}, the Chinese ${after.length}`);
    else if (after.length > before.length) out.push("adds a link, which is Staff's to add");
    else if (before.some((l, i) => l !== after[i])) out.push("moves its links out of the English's order");
  }
  const varsBefore = wordsVariables(shape);
  const varsAfter = wordsVariables(words);
  for (const k of varsBefore) if (!varsAfter.includes(k)) out.push(`drops the Variable {${k}}`);
  for (const k of varsAfter) if (!varsBefore.includes(k)) out.push(`adds the Variable {${k}}, which the English doesn't have`);
  out.push(...chineseWordsProblems(wordsText(words), source));
  return out.slice(0, 3);
}

/** The words a line names its Variables in. */
const lineVariables = (text: string) => placeholdersIn(text).filter(isVariableKey);

/** Pure — the English a translation may repeat: every word of the email, Staff's own. */
export function translateSourceText(request: TranslateRequest): string {
  return [request.subject, request.preheader, ...contentWords(request.content), ...Object.values(request.content.fallbacks)].join("\n");
}

/**
 * Pure — Claude's answer to `request` as the 中文 version's words, each block
 * with the fingerprint of the English it was made from, or every reason it
 * was refused, each naming its block. Nothing of a refused answer is kept.
 */
export function translationFromAnswer(request: TranslateRequest, raw: unknown): { ok: true; translation: ChineseTranslation } | { ok: false; problems: string[] } {
  const answer = translateOutputSchema(request).safeParse(raw);
  if (!answer.success) return { ok: false, problems: [`the answer didn't fit (${issueText(answer.error)})`] };
  const data = answer.data as { subject?: string; previewLine?: string; blocks: Record<string, unknown>[]; fallbacks?: Record<string, string> };
  const source = translateSourceText(request);
  const asked = blocksToTranslate(request);
  const problems: string[] = [];
  const blocks: Record<string, ChineseBlockWords> = {};
  const seen = new Set<string>();
  for (const raw of data.blocks) {
    const id = String(raw.id);
    const english = asked.find((b) => b.id === id);
    if (!english) {
      problems.push(`it wrote a block "${id}" that it wasn't given`);
      continue;
    }
    const label = blockLabel(request.content, english);
    if (seen.has(id)) {
      problems.push(`${label} is in the answer twice`);
      continue;
    }
    seen.add(id);
    if (raw.type !== english.type) {
      problems.push(`${label} came back as a ${String(raw.type)} block`);
      continue;
    }
    const made = wordsFromAnswer(english, raw, blockLinkList(english).length);
    if (!made.ok) {
      problems.push(`${label} ${made.problem}`);
      continue;
    }
    const bad = translatedBlockProblems(english, made.words, source);
    if (bad.length) problems.push(`${label} ${bad.join("; ")}`);
    else blocks[id] = { ...made.words, from: wordsFingerprint(english) } as ChineseBlockWords;
  }
  for (const b of asked) if (!seen.has(b.id)) problems.push(`${blockLabel(request.content, b)} is missing from the answer`);

  const translation: ChineseTranslation = { blocks };
  if (request.lines) {
    const subject = squashed(data.subject) ?? "";
    const preheader = squashed(data.previewLine) ?? "";
    const lineProblems = (what: string, text: string, english: string, max: number) => {
      const out: string[] = [];
      if (text.length > max) out.push(`is over ${max} characters`);
      const before = lineVariables(english);
      const after = lineVariables(text);
      for (const k of before) if (!after.includes(k)) out.push(`drops the Variable {${k}}`);
      for (const k of after) if (!before.includes(k)) out.push(`adds the Variable {${k}}, which the English doesn't have`);
      out.push(...chineseWordsProblems(text, source));
      if (out.length) problems.push(`${what} ${out.slice(0, 3).join("; ")}`);
    };
    if (!subject && request.subject.trim()) problems.push("The subject is empty");
    lineProblems("The subject", subject, request.subject, CONTENT_LIMITS.subject);
    if (!preheader && request.preheader.trim()) problems.push("The preview line is empty");
    lineProblems("The preview line", preheader, request.preheader, CONTENT_LIMITS.preheader);
    Object.assign(translation, { subject, preheader, from: linesFingerprint(request.subject, request.preheader) });
  }
  const wanted = fallbacksToTranslate(request);
  if (wanted.length) {
    const fallbacks: Partial<Record<VariableKey, string>> = {};
    for (const key of wanted) {
      const words = squashed(data.fallbacks?.[key]) ?? "";
      const what = `The fallback for ${campaignVariable(key).label}`;
      if (!words) problems.push(`${what} is empty`);
      else if (words.length > VARIABLE_MAX || /[{}<>]/.test(words)) problems.push(`${what} is not a few words`);
      else {
        const bad = chineseWordsProblems(words, source);
        if (bad.length) problems.push(`${what} ${bad.join("; ")}`);
        else fallbacks[key] = words;
      }
    }
    translation.fallbacks = fallbacks;
  }
  return problems.length ? { ok: false, problems } : { ok: true, translation };
}
