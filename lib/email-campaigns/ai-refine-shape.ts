/**
 * ✨ Refine's shapes (PRD-campaign-email-editor slice 10): what the editor
 * asks for, what Claude fills in, and how a rewrite comes back as the block
 * it rewrote. Pure, and safe in the browser.
 *
 * Each answer's schema is small and built per request. Ideas are a list of
 * lines. A rewrite is its block's words: a heading's line, or a text block's
 * paragraphs whose runs name the original's links by key (`L1`, `L2`), never
 * by address, and its Variables by name. Claude sees no link and writes none:
 * code puts each key's link back, then re-parses the block with
 * `EmailBlockSchema`, the schema a save uses, which holds the lengths.
 */
import { z } from "zod";
import { placeholdersIn } from "@/lib/email/copy";
import { issueText, paragraphsFrom, wordsAsRuns } from "./ai-draft-shape";
import { DRAFT_LIMITS } from "./ai-draft-brief";
import { wordCount } from "./ai-drafted";
import type { RewritableBlock } from "./ai-refine-brief";
import { CONTENT_LIMITS, EmailBlockSchema, contentWords, paragraphLinks, paragraphRuns, type EmailBlock, type Run } from "./content";
import { CAMPAIGN_LIMITS } from "./rules";
import { isVariableKey, type VariableKey } from "./variables";

/** How a block can be rewritten: the labelled choices, then *Something else…* in Staff's own words. */
export const REWRITE_ACTIONS = ["shorter", "warmer", "clearer", "fix_grammar", "other"] as const;
export type RewriteAction = (typeof REWRITE_ACTIONS)[number];

export const REWRITE_ACTION_LABEL: Record<RewriteAction, string> = {
  shorter: "Shorter",
  warmer: "Warmer",
  clearer: "Clearer",
  fix_grammar: "Fix grammar",
  other: "Something else…",
};

export const REFINE_LIMITS = {
  /** Subject lines per ask. */
  subjects: 5,
  /** Preview lines per ask. */
  previewLines: 2,
  /** *Something else…*: one line of Staff's words. */
  instruction: 120,
  /** Ideas already shown, sent along with *More ideas* so the next ones differ. */
  exclude: 20,
} as const;

export const isRewritable = (b: EmailBlock): b is RewritableBlock => b.type === "heading" || b.type === "text";

export const REWRITE_NEEDS_WORDS = "Write something here first, then Claude can rewrite it.";

/** Pure — why `block` can't be rewritten yet (it has no words), or null. */
export function rewriteBlocker(block: RewritableBlock): string | null {
  const words = block.type === "heading" ? block.text : paragraphRuns(block.paragraphs).map((r) => ("text" in r ? r.text : "")).join(" ");
  return wordCount(words.replace(/\{[a-z_]+\}/g, "")) ? null : REWRITE_NEEDS_WORDS;
}


const CAMPAIGN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const common = {
  campaignId: z.string().regex(CAMPAIGN_ID).nullable(),
  subject: z.string().max(CAMPAIGN_LIMITS.subject),
  name: z.string().max(CAMPAIGN_LIMITS.name),
};

/** The email's words (`contentWords`), Staff's own, that ideas are written from. */
const words = z
  .array(z.string())
  .max(CONTENT_LIMITS.blocks * 4)
  .refine((w) => w.join("\n").length <= DRAFT_LIMITS.existing, "The email is too long to send along.");

const shown = (max: number) => z.array(z.string().max(max)).max(REFINE_LIMITS.exclude);

/**
 * What the editor sends: subject line ideas, preview line ideas, or a
 * rewrite of one heading or text block, as the editor holds it now. `exclude`
 * is what Claude already suggested (*More ideas*, *Try again*), so the next
 * answer differs. Nothing here is a customer's.
 */
export const RefineRequestSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("subjects"), ...common, preheader: z.string().max(CAMPAIGN_LIMITS.preheader), words, exclude: shown(CAMPAIGN_LIMITS.subject) }),
  z.strictObject({ kind: z.literal("preview_lines"), ...common, preheader: z.string().max(CAMPAIGN_LIMITS.preheader), words, exclude: shown(CAMPAIGN_LIMITS.preheader) }),
  z
    .strictObject({
      kind: z.literal("rewrite"),
      ...common,
      block: EmailBlockSchema.refine(isRewritable, "Only a heading or a text block can be rewritten."),
      action: z.enum(REWRITE_ACTIONS),
      instruction: z.string().trim().max(REFINE_LIMITS.instruction, `At most ${REFINE_LIMITS.instruction} characters.`),
      exclude: z.array(z.string().max(CONTENT_LIMITS.text)).max(3),
    })
    .superRefine((r, ctx) => {
      if (r.action === "other" && !r.instruction) ctx.addIssue({ code: "custom", path: ["instruction"], message: "Say how Claude should change it." });
    }),
]);
export type RefineRequest = z.output<typeof RefineRequestSchema>;
export type RewriteRequest = Extract<RefineRequest, { kind: "rewrite" }> & { block: RewritableBlock };

/** What the route answers: the ideas that passed every check, or the rewritten block, its id kept. */
export type RefineResult = { kind: "subjects" | "preview_lines"; ideas: string[] } | { kind: "rewrite"; block: RewritableBlock };

// ---------------------------------------------------------------------------
// A rewrite's links and Variables
// ---------------------------------------------------------------------------

/** A link's key in the block Claude reads: `L1` for the first address. */
export const linkKey = (i: number) => `L${i + 1}`;

/** Pure — each address the block links to, once, in order: `L1` is the first. */
export function blockLinks(block: RewritableBlock): string[] {
  return block.type === "heading" ? [] : paragraphLinks(block.paragraphs);
}

/** Pure — the Variables the block's words use, once each, written as runs or as `{name}`. */
export function blockVariables(block: RewritableBlock): VariableKey[] {
  return placeholdersIn(contentWords({ v: 1, blocks: [block], fallbacks: {} }).join("\n")).filter(isVariableKey);
}

type SourceRun = { text: string; bold?: true; italic?: true; link?: string } | { var: VariableKey };

/** Pure — the block as Claude reads it: its words, a link as its key, never its address. */
export function rewriteSource(block: RewritableBlock): unknown {
  if (block.type === "heading") return { type: "heading", level: block.level, text: block.text };
  const links = blockLinks(block);
  const runs = (rs: readonly Run[]): SourceRun[] =>
    rs.map((r) =>
      "var" in r
        ? { var: r.var }
        : {
            text: r.text,
            ...(r.bold ? { bold: true as const } : {}),
            ...(r.italic ? { italic: true as const } : {}),
            ...(r.href ? { link: linkKey(links.indexOf(r.href)) } : {}),
          },
    );
  return {
    type: "text",
    paragraphs: block.paragraphs.map((p) => (p.kind === "p" ? { kind: "p", runs: runs(p.runs) } : { kind: "bullets", items: p.items.map(runs) })),
  };
}

/** Claude's answer for a rewrite of `block`: a heading's line, or a text block's paragraphs with its links and Variables. */
export function rewriteOutputSchema(block: RewritableBlock) {
  if (block.type === "heading") {
    return z.strictObject({
      text: z.string().describe("The heading, rewritten: one line of at most 120 characters, with the original's Variables written as it writes them, such as {first_name}."),
    });
  }
  const links = blockLinks(block).map((_, i) => linkKey(i));
  const vars = blockVariables(block);
  // Strict objects and enums: the SDK's JSON schema leaves enums to the
  // descriptions, so this parse, not the grammar, holds the keys.
  const words = z.strictObject({
    text: z.string().describe("Plain words. A line break is \\n. No markdown, no HTML, no links."),
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    ...(links.length ? { link: z.enum(links as [string, ...string[]]).optional().describe("The key of one of the original's links, on the words it links.") } : {}),
  });
  const run = vars.length ? z.union([words, z.strictObject({ var: z.enum(vars as [VariableKey, ...VariableKey[]]) })]) : words;
  const runs = z.array(run).describe("The words of one paragraph or bullet, in runs.");
  return z.strictObject({
    paragraphs: z
      .array(z.union([z.strictObject({ kind: z.literal("p"), runs }), z.strictObject({ kind: z.literal("bullets"), items: z.array(runs).describe("Each bullet's runs.") })]))
      .describe("The text block's paragraphs and bullet lists, rewritten."),
  });
}

/** Claude's answer for ideas: the lines alone. */
export function ideasOutputSchema(kind: "subjects" | "preview_lines") {
  return kind === "subjects"
    ? z.strictObject({ subjects: z.array(z.string()).describe(`Exactly ${REFINE_LIMITS.subjects} subject lines, each different, under 60 characters where they can be.`) })
    : z.strictObject({
        previewLines: z.array(z.string()).describe(`Exactly ${REFINE_LIMITS.previewLines} preview lines of 40 to 90 characters that follow the subject without repeating it.`),
      });
}

/** Pure — the schema of Claude's answer to `request`. */
export function refineOutputSchema(request: RefineRequest) {
  return request.kind === "rewrite" ? rewriteOutputSchema(request.block as RewritableBlock) : ideasOutputSchema(request.kind);
}

type RewriteRunIn = { text: string; bold?: boolean; italic?: boolean; link?: string } | { var: VariableKey };
type RewriteParagraphsIn = ({ kind: "p"; runs: RewriteRunIn[] } | { kind: "bullets"; items: RewriteRunIn[][] })[];

/**
 * Pure — Claude's rewrite of `original` as the block itself, its id and its
 * level kept, or why not: first by the answer's own schema (only the
 * original's link keys and Variables), then by the schema a save uses.
 */
export function rewriteFromAnswer(original: RewritableBlock, raw: unknown): { ok: true; block: RewritableBlock } | { ok: false; problem: string } {
  const answer = rewriteOutputSchema(original).safeParse(raw);
  if (!answer.success) return { ok: false, problem: `the answer didn't fit (${issueText(answer.error)})` };
  let candidate: unknown;
  if (original.type === "heading") {
    candidate = { ...original, text: (answer.data as { text: string }).text.replace(/\s+/g, " ").trim() };
  } else {
    const links = blockLinks(original);
    const vars = blockVariables(original);
    const runs = (rs: RewriteRunIn[]): Run[] =>
      rs.flatMap((r): Run[] => {
        if ("var" in r) return [{ var: r.var }];
        const href = r.link ? links[Number(r.link.slice(1)) - 1] : undefined;
        return wordsAsRuns(r.text, { ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(href ? { href } : {}) }, vars);
      });
    candidate = { id: original.id, type: "text", paragraphs: paragraphsFrom((answer.data as { paragraphs: RewriteParagraphsIn }).paragraphs, runs) };
  }
  const saved = EmailBlockSchema.safeParse(candidate);
  if (!saved.success) return { ok: false, problem: issueText(saved.error) };
  return { ok: true, block: saved.data as RewritableBlock };
}

/** Pure — a block's words as a reader reads them, a Variable as `{name}`, a line per paragraph or bullet: what Try again's `exclude` sends. */
export function rewriteWords(block: RewritableBlock): string {
  if (block.type === "heading") return block.text;
  const line = (runs: readonly Run[]) => runs.map((r) => ("var" in r ? `{${r.var}}` : r.text)).join("");
  return block.paragraphs.flatMap((p) => (p.kind === "p" ? [line(p.runs)] : p.items.map(line))).join("\n");
}
