import { wordCount } from "./ai-drafted";
import type { EmailBlock } from "./content";

export type RefineKind = "subjects" | "preview_lines" | "rewrite";

export type IdeasKind = Exclude<RefineKind, "rewrite">;

export const REFINE_BUTTON_LABEL: Record<IdeasKind, string> = {
  subjects: "Suggest subject lines",
  preview_lines: "Suggest preview lines",
};

export const REFINE_STAGE_TEXT: Record<RefineKind, string> = {
  subjects: "Writing subject lines…",
  preview_lines: "Writing preview lines…",
  rewrite: "Rewriting…",
};

export const REFINE_NEEDS_WORDS = "Write some of the email first, then Claude can suggest subject lines from it.";
export const REFINE_NEEDS_SUBJECT = "Write the subject first, then Claude can suggest a preview line to follow it.";

export function ideasBlocker(kind: IdeasKind, { subject, words }: { subject: string; words: readonly string[] }): string | null {
  if (kind === "preview_lines") return wordCount(subject) ? null : REFINE_NEEDS_SUBJECT;
  return wordCount([subject, ...words].join(" ")) >= 3 ? null : REFINE_NEEDS_WORDS;
}

export type RewritableBlock = Extract<EmailBlock, { type: "heading" | "text" }>;
