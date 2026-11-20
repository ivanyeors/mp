import { CONTENT_LIMITS, type CampaignContent, type EmailBlock, type Paragraph } from "./content";

export const DRAFT_TITLE_WORDS = 3;

export const DRAFT_NEEDS_TITLE = "Write a subject of at least 3 words, then Claude can draft the email from it.";

export const DRAFT_STAGE_TEXT = { reading: "Reading your brief…", writing: "Writing the email…" } as const;
export type DraftStage = keyof typeof DRAFT_STAGE_TEXT;

export const draftTitle = (subject: string, name: string) => (subject.trim() ? subject : name).replace(/\s+/g, " ").trim();

export const wordCount = (text: string) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export function draftBlocker(subject: string, name: string): string | null {
  return wordCount(draftTitle(subject, name)) >= DRAFT_TITLE_WORDS ? null : DRAFT_NEEDS_TITLE;
}

export type DraftMode = "replace" | "add";

const marksOf = (content: CampaignContent, marked: readonly string[]): CampaignContent => {
  const rest = { ...content };
  delete rest.aiDrafted;
  return marked.length ? { ...rest, aiDrafted: [...new Set(marked)] } : rest;
};

export function markAiDrafted(content: CampaignContent, ids: readonly string[]): CampaignContent {
  return marksOf(content, [...(content.aiDrafted ?? []), ...ids]);
}

export function keepAiDrafted(content: CampaignContent, ids?: readonly string[]): CampaignContent {
  const kept = ids ? new Set(ids) : null;
  return marksOf(content, (content.aiDrafted ?? []).filter((id) => kept && !kept.has(id)));
}

export function withEditedBlocks(content: CampaignContent, blocks: EmailBlock[]): CampaignContent {
  const before = new Map(content.blocks.map((b) => [b.id, b]));
  const still = (content.aiDrafted ?? []).filter((id) => {
    const now = blocks.find((b) => b.id === id);
    return now !== undefined && now === before.get(id);
  });
  return marksOf({ ...content, blocks }, still);
}

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

export function withDraftText(content: CampaignContent, blockId: string, paragraphs: Paragraph[] | null): CampaignContent {
  const blocks = content.blocks.map((b) => (b.id === blockId && b.type === "text" ? { ...b, paragraphs: paragraphs ?? [] } : b));
  const marks = (content.aiDrafted ?? []).filter((id) => id !== blockId);
  return marksOf({ ...content, blocks }, paragraphs ? [...marks, blockId] : marks);
}
