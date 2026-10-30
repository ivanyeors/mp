/**
 * ✨ Generate in the editor (PRD-campaign-email-editor slice 09): when it can
 * run, the words of its two stages, and how a draft lands in the content as
 * it streams in, marked *Drafted with AI* until a person edits or keeps each
 * block. Pure, small and schema-free, for the editor's first load: the brief
 * is ai-draft-brief.ts, the draft's schemas ai-draft-shape.ts.
 */
import { CONTENT_LIMITS, type CampaignContent, type EmailBlock, type Paragraph } from "./content";

/** The words ✨ Generate needs from the subject (or, with no subject, the campaign name). */
export const DRAFT_TITLE_WORDS = 3;

export const DRAFT_NEEDS_TITLE = "Write a subject of at least 3 words, then Claude can draft the email from it.";

/** The two stages the editor shows while Claude works. */
export const DRAFT_STAGE_TEXT = { reading: "Reading your brief…", writing: "Writing the email…" } as const;
export type DraftStage = keyof typeof DRAFT_STAGE_TEXT;

/** Pure — what ✨ Generate writes from: the subject, else the campaign name. */
export const draftTitle = (subject: string, name: string) => (subject.trim() ? subject : name).replace(/\s+/g, " ").trim();

/** Pure — the words a reader would count: a Variable written `{first_name}` is one. */
export const wordCount = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/** Pure — why ✨ Generate can't run yet (a title under 3 words), or null when it can. */
export function draftBlocker(subject: string, name: string): string | null {
  return wordCount(draftTitle(subject, name)) >= DRAFT_TITLE_WORDS ? null : DRAFT_NEEDS_TITLE;
}

/** Whether a draft replaces the email's blocks or goes below them. */
export type DraftMode = "replace" | "add";

/** The content with exactly `marked` marked: no `aiDrafted` at all when none is. */
const marksOf = (content: CampaignContent, marked: readonly string[]): CampaignContent => {
  const rest = { ...content };
  delete rest.aiDrafted;
  return marked.length ? { ...rest, aiDrafted: [...new Set(marked)] } : rest;
};

/** Pure — `ids` marked *Drafted with AI*, with the marks already there. */
export function markAiDrafted(content: CampaignContent, ids: readonly string[]): CampaignContent {
  return marksOf(content, [...(content.aiDrafted ?? []), ...ids]);
}

/** Pure — *Keep*: `ids` (every block, when left out) read by a person, unmarked. */
export function keepAiDrafted(content: CampaignContent, ids?: readonly string[]): CampaignContent {
  const kept = ids ? new Set(ids) : null;
  return marksOf(content, (content.aiDrafted ?? []).filter((id) => kept && !kept.has(id)));
}

/**
 * Pure — the content with `blocks` after an edit in the editor: a marked
 * block a person changed, or deleted, is no longer *Drafted with AI*. A move
 * keeps the block as it is, and its mark.
 */
export function withEditedBlocks(content: CampaignContent, blocks: EmailBlock[]): CampaignContent {
  const before = new Map(content.blocks.map((b) => [b.id, b]));
  const still = (content.aiDrafted ?? []).filter((id) => {
    const now = blocks.find((b) => b.id === id);
    return now !== undefined && now === before.get(id);
  });
  return marksOf({ ...content, blocks }, still);
}

/**
 * Pure — the content with a draft's blocks so far, each marked: in place of
 * the email's blocks (`replace`), or after them (`add`), as many as there is
 * room for. `ever` is every block this draft has put in, so a restart takes
 * the earlier attempt's out again.
 */
export function withDraftBlocks(
  content: CampaignContent,
  drafted: readonly EmailBlock[],
  { mode, ever }: { mode: DraftMode; ever: ReadonlySet<string> },
): CampaignContent {
  const others = mode === "replace" ? [] : content.blocks.filter((b) => !ever.has(b.id));
  const blocks = [...others, ...drafted.slice(0, Math.max(0, CONTENT_LIMITS.blocks - others.length))];
  const present = new Set(blocks.map((b) => b.id));
  const marks = (content.aiDrafted ?? []).filter((id) => present.has(id) && !ever.has(id));
  return marksOf({ ...content, blocks }, [...marks, ...blocks.filter((b) => ever.has(b.id)).map((b) => b.id)]);
}

/**
 * Pure — one text block's words as Claude wrote them (*✨ Write this from the
 * subject*), marked; or, with `paragraphs` null, back to empty and unmarked.
 */
export function withDraftText(content: CampaignContent, blockId: string, paragraphs: Paragraph[] | null): CampaignContent {
  const blocks = content.blocks.map((b) => (b.id === blockId && b.type === "text" ? { ...b, paragraphs: paragraphs ?? [] } : b));
  const marks = (content.aiDrafted ?? []).filter((id) => id !== blockId);
  return marksOf({ ...content, blocks }, paragraphs ? [...marks, blockId] : marks);
}
