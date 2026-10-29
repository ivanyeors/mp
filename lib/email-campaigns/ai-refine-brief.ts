/**
 * ✨ Refine in the editor (PRD-campaign-email-editor slice 10): what Staff can
 * ask Claude for in an email they wrote themselves (subject line ideas,
 * preview line ideas, a rewrite of one heading or text block): the words of
 * its buttons, and when ideas can be asked for. Pure and tiny, for the
 * editor's first load: the choices, the limits, when a block can be
 * rewritten and the request's schema are ai-refine-shape.ts, loaded after the
 * page; the call is ai-refine.ts.
 */
import { wordCount } from "./ai-drafted";
import type { EmailBlock } from "./content";

/** The quick actions, by their audit kind (lib/ai/usage.ts): each runs at the quick actions effort. */
export type RefineKind = "subjects" | "preview_lines" | "rewrite";

/** The ideas kinds: they fill a field rather than a block. */
export type IdeasKind = Exclude<RefineKind, "rewrite">;

/** The ✨ buttons' names, for the eye and for a screen reader (NN/g, *Prompt controls in GenAI*). */
export const REFINE_BUTTON_LABEL: Record<IdeasKind, string> = {
  subjects: "Suggest subject lines",
  preview_lines: "Suggest preview lines",
};

/** What a ✨ button says while Claude works. */
export const REFINE_STAGE_TEXT: Record<RefineKind, string> = {
  subjects: "Writing subject lines…",
  preview_lines: "Writing preview lines…",
  rewrite: "Rewriting…",
};

export const REFINE_NEEDS_WORDS = "Write some of the email first, then Claude can suggest subject lines from it.";
export const REFINE_NEEDS_SUBJECT = "Write the subject first, then Claude can suggest a preview line to follow it.";

/**
 * Pure — why ideas can't be asked for yet, or null: subject lines need some
 * of the email to be written from (3 words, the subject's or the blocks'),
 * and a preview line a subject to follow.
 */
export function ideasBlocker(kind: IdeasKind, { subject, words }: { subject: string; words: readonly string[] }): string | null {
  if (kind === "preview_lines") return wordCount(subject) ? null : REFINE_NEEDS_SUBJECT;
  return wordCount([subject, ...words].join(" ")) >= 3 ? null : REFINE_NEEDS_WORDS;
}

/** The blocks Claude can rewrite: a heading and a text block. */
export type RewritableBlock = Extract<EmailBlock, { type: "heading" | "text" }>;
