import { z } from "zod";
import { placeholdersIn } from "@/lib/email/copy";
import { issueText, paragraphsFrom, wordsAsRuns } from "./ai-draft-shape";
import { DRAFT_LIMITS } from "./ai-draft-brief";
import { wordCount } from "./ai-drafted";
import type { RewritableBlock } from "./ai-refine-brief";
import { CONTENT_LIMITS, EmailBlockSchema, contentWords, paragraphLinks, paragraphRuns, type EmailBlock, type Run } from "./content";
import { CAMPAIGN_LIMITS } from "./rules";
import { isVariableKey, type VariableKey } from "./variables";

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
  subjects: 5,
  previewLines: 2,
  instruction: 120,
  exclude: 20,
} as const;

export const isRewritable = (b: EmailBlock): b is RewritableBlock => b.type === "heading" || b.type === "text";

export const REWRITE_NEEDS_WORDS = "Write something here first, then Claude can rewrite it.";

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

const words = z
  .array(z.string())
  .max(CONTENT_LIMITS.blocks * 4)
  .refine((w) => w.join("\n").length <= DRAFT_LIMITS.existing, "The email is too long to send along.");

const shown = (max: number) => z.array(z.string().max(max)).max(REFINE_LIMITS.exclude);

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

export type RefineResult = { kind: "subjects" | "preview_lines"; ideas: string[] } | { kind: "rewrite"; block: RewritableBlock };

export const linkKey = (i: number) => `L${i + 1}`;

export function blockLinks(block: RewritableBlock): string[] {
  return block.type === "heading" ? [] : paragraphLinks(block.paragraphs);
}

export function blockVariables(block: RewritableBlock): VariableKey[] {
  return placeholdersIn(contentWords({ v: 1, blocks: [block], fallbacks: {} }).join("\n")).filter(isVariableKey);
}

type SourceRun = { text: string; bold?: true; italic?: true; link?: string } | { var: VariableKey };

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

export function rewriteOutputSchema(block: RewritableBlock) {
  if (block.type === "heading") {
    return z.strictObject({
      text: z.string().describe("The heading, rewritten: one line of at most 120 characters, with the original's Variables written as it writes them, such as {first_name}."),
    });
  }
  const links = blockLinks(block).map((_, i) => linkKey(i));
  const vars = blockVariables(block);
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

export function ideasOutputSchema(kind: "subjects" | "preview_lines") {
  return kind === "subjects"
    ? z.strictObject({ subjects: z.array(z.string()).describe(`Exactly ${REFINE_LIMITS.subjects} subject lines, each different, under 60 characters where they can be.`) })
    : z.strictObject({
        previewLines: z.array(z.string()).describe(`Exactly ${REFINE_LIMITS.previewLines} preview lines of 40 to 90 characters that follow the subject without repeating it.`),
      });
}

export function refineOutputSchema(request: RefineRequest) {
  return request.kind === "rewrite" ? rewriteOutputSchema(request.block as RewritableBlock) : ideasOutputSchema(request.kind);
}

type RewriteRunIn = { text: string; bold?: boolean; italic?: boolean; link?: string } | { var: VariableKey };
type RewriteParagraphsIn = ({ kind: "p"; runs: RewriteRunIn[] } | { kind: "bullets"; items: RewriteRunIn[][] })[];

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

export function rewriteWords(block: RewritableBlock): string {
  if (block.type === "heading") return block.text;
  const line = (runs: readonly Run[]) => runs.map((r) => ("var" in r ? `{${r.var}}` : r.text)).join("");
  return block.paragraphs.flatMap((p) => (p.kind === "p" ? [line(p.runs)] : p.items.map(line))).join("\n");
}
